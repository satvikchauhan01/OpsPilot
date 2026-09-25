import { Change } from '../models/change.js';
import { imageVersion } from '../changes/diff.js';
import { serviceQueries } from '../topology/service.js';
import { condenseTrace, groupLogs } from './condense.js';

// A tool result bigger than this gets its longest lists trimmed before the model sees it.
const MAX_RESULT_CHARS = 7000;
const SERVICE_NAME = /^[a-z0-9][a-z0-9-]{0,62}$/;
const TRACE_ID = /^[0-9a-f]{16,32}$/i;
const NOISY_LABELS = new Set(['__name__', 'instance', 'job']);

/**
 * The read-only tools the investigator can call. "Now" is the anchor time: the moment the
 * investigation looks at, which is the present for a live incident and the resolution time
 * for one looked at after the fact.
 */
export function createTools({ prometheus, loki, tempo, kube, namespace, anchor, incidentStart }) {
  const before = (minutes) => new Date(anchor.getTime() - minutes * 60_000);
  const serviceArg = { type: 'string', description: 'Service name, e.g. checkout' };

  const tools = [
    {
      name: 'get_service_health',
      description:
        'Request rate, error ratio, p95 latency, memory used of limit and worker-pool saturation for every service, now and 10 minutes before the incident started.',
      parameters: { type: 'object', properties: {} },
      title: () => 'Service health now and before the incident',
      async run() {
        const queries = serviceQueries(namespace);
        const baseline = new Date(incidentStart.getTime() - 10 * 60_000);
        const metrics = ['rps', 'errorRatio', 'p95', 'memory', 'saturation'];
        const [current, earlier] = await Promise.all(
          [anchor, baseline].map((time) =>
            Promise.all(metrics.map((metric) => prometheus.query(queries[metric], time))),
          ),
        );

        const services = {};
        metrics.forEach((metric, i) => {
          for (const { labels, value } of current[i])
            ((services[labels.service] ??= {})[metric] ??= {}).now = round(value);
          for (const { labels, value } of earlier[i])
            ((services[labels.service] ??= {})[metric] ??= {}).before = round(value);
        });
        return {
          now: anchor.toISOString(),
          before: baseline.toISOString(),
          units: 'rps in req/s, p95 in seconds, ratios 0-1',
          services,
        };
      },
    },

    {
      name: 'get_call_graph',
      description:
        'Which service calls which (from traces), with request rates and failure ratios per edge, plus how callers see each dependency: ok, error, timeout or client_error responses per second.',
      parameters: { type: 'object', properties: {} },
      title: () => 'Calls between services and their outcomes',
      async run() {
        const [calls, failed, outcomes] = await Promise.all([
          prometheus.query('sum by (client, server) (rate(traces_service_graph_request_total[5m]))', anchor),
          prometheus.query('sum by (client, server) (rate(traces_service_graph_request_failed_total[5m]))', anchor),
          prometheus.query(
            `sum by (service, target, outcome) (rate(http_client_requests_total{namespace="${namespace}"}[5m]))`,
            anchor,
          ),
        ]);
        const failures = new Map(failed.map(({ labels, value }) => [`${labels.client}>${labels.server}`, value]));
        const edges = calls
          .filter(({ labels }) => labels.client !== 'unknown' && labels.server !== 'unknown')
          .map(({ labels, value }) => ({
            from: labels.client === 'user' ? 'customers' : labels.client,
            to: labels.server,
            rps: round(value),
            failedRatio: round(value > 0 ? (failures.get(`${labels.client}>${labels.server}`) ?? 0) / value : 0),
          }));

        const callerView = {};
        for (const { labels, value } of outcomes) {
          (callerView[`${labels.service} -> ${labels.target}`] ??= {})[labels.outcome] = round(value);
        }
        return { edges, callerView };
      },
    },

    {
      name: 'list_changes',
      description:
        'Deploys (image/version changes), scaling, config changes, restarts and rollouts in the namespace, plus a summary of Kubernetes warnings and container restarts, oldest first.',
      parameters: {
        type: 'object',
        properties: {
          minutes: { type: 'integer', minimum: 5, maximum: 1440, description: 'How far back to look (default 60).' },
          service: { ...serviceArg, description: 'Only this service (optional).' },
        },
      },
      title: ({ minutes = 60, service }) => `Changes in the last ${minutes} min${service ? ` for ${service}` : ''}`,
      async run({ minutes = 60, service }) {
        const filter = { namespace, at: { $gte: before(minutes), $lte: anchor } };
        if (service) filter.service = service;
        const changes = await Change.find(filter).sort({ at: 1 }).limit(400).lean();

        const warnings = {};
        for (const change of changes.filter((c) => c.kind === 'warning' || c.kind === 'pod_restart')) {
          const key = `${change.service} ${change.details?.reason ?? change.kind}`;
          const summary = (warnings[key] ??= { count: 0, first: change.at, last: change.at, example: change.summary });
          summary.count += change.occurrences ?? 1;
          summary.last = change.lastSeenAt ?? change.at;
        }
        return {
          from: before(minutes).toISOString(),
          to: anchor.toISOString(),
          changes: changes
            .filter((c) => c.kind !== 'warning' && c.kind !== 'pod_restart')
            .map((c) => ({
              at: c.at,
              kind: c.kind,
              service: c.service,
              summary: c.summary,
              changeCause: c.details?.changeCause,
            })),
          warningsAndRestarts: warnings,
        };
      },
    },

    {
      name: 'get_workload',
      description:
        "Kubernetes state of one service: replicas, running version, rollout history (revisions with versions and change causes), and each pod's restarts, last termination reason and memory used of its limit.",
      parameters: { type: 'object', properties: { service: serviceArg }, required: ['service'] },
      title: ({ service }) => `Kubernetes state of ${service}`,
      async run({ service }) {
        if (!SERVICE_NAME.test(service ?? '')) return { error: 'service must be a service name like checkout' };
        const selector = `app.kubernetes.io/name=${service}`;
        const podPattern = `${service}-[a-z0-9]+-[a-z0-9]{5}`;

        const [deployment, replicaSets, pods, memory] = await Promise.all([
          kube.apps.readNamespacedDeployment({ name: service, namespace }).catch(() => null),
          kube.apps.listNamespacedReplicaSet({ namespace, labelSelector: selector }),
          kube.core.listNamespacedPod({ namespace, labelSelector: selector }),
          prometheus.query(
            `max by (pod) (container_memory_working_set_bytes{namespace="${namespace}", pod=~"${podPattern}", container=""})` +
              ` / on (pod) sum by (pod) (kube_pod_container_resource_limits{namespace="${namespace}", pod=~"${podPattern}", resource="memory"})`,
            anchor,
          ),
        ]);
        if (!deployment) return { error: `there is no deployment called ${service}` };

        const memoryOf = new Map(memory.map(({ labels, value }) => [labels.pod, round(value)]));
        const annotations = deployment.metadata.annotations ?? {};
        return {
          service,
          version: imageVersion(deployment.spec.template.spec.containers[0].image),
          revision: Number(annotations['deployment.kubernetes.io/revision']) || null,
          changeCause: annotations['kubernetes.io/change-cause'],
          replicas: {
            desired: deployment.spec.replicas,
            ready: deployment.status.readyReplicas ?? 0,
            updated: deployment.status.updatedReplicas ?? 0,
          },
          rollout: deployment.status.conditions?.find((c) => c.type === 'Progressing')?.message,
          revisions: replicaSets.items
            .map((rs) => ({
              revision: Number(rs.metadata.annotations?.['deployment.kubernetes.io/revision']),
              version: imageVersion(rs.spec.template.spec.containers[0].image),
              changeCause: rs.metadata.annotations?.['kubernetes.io/change-cause'],
              runningPods: rs.status.replicas ?? 0,
              createdAt: rs.metadata.creationTimestamp,
            }))
            .sort((a, b) => b.revision - a.revision)
            .slice(0, 5),
          pods: pods.items.map((pod) => {
            const status = pod.status.containerStatuses?.[0];
            const last = status?.lastState?.terminated;
            return {
              name: pod.metadata.name,
              phase: pod.status.phase,
              ready: status?.ready ?? false,
              restarts: status?.restartCount ?? 0,
              lastTermination: last ? { reason: last.reason, exitCode: last.exitCode, at: last.finishedAt } : undefined,
              startedAt: status?.state?.running?.startedAt,
              memoryOfLimit: memoryOf.get(pod.metadata.name) ?? null,
            };
          }),
        };
      },
    },

    {
      name: 'query_metrics',
      description:
        'Run an instant PromQL query against Prometheus. Returns up to 20 series with their labels and value. Use rate() for counters.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'PromQL expression' },
          minutesAgo: {
            type: 'integer',
            minimum: 0,
            maximum: 1440,
            description: 'Evaluate this many minutes before now (default 0).',
          },
        },
        required: ['query'],
      },
      title: ({ query }) => `PromQL: ${query}`,
      async run({ query, minutesAgo = 0 }) {
        if (!query || query.length > 600) return { error: 'the query must be between 1 and 600 characters' };
        const series = await prometheus.query(query, before(minutesAgo));
        return {
          at: before(minutesAgo).toISOString(),
          total: series.length,
          series: series
            .slice(0, 20)
            .map(({ labels, value }) => ({ labels: cleanLabels(labels), value: round(value) })),
        };
      },
    },

    {
      name: 'query_metrics_range',
      description:
        'Run a PromQL range query over the last N minutes. Each series comes back summarised (first, last, min, max, mean) with about 15 samples, as [minutes before now, value].',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'PromQL expression' },
          minutes: { type: 'integer', minimum: 5, maximum: 240, description: 'Window length (default 30).' },
        },
        required: ['query'],
      },
      title: ({ query, minutes = 30 }) => `PromQL over ${minutes} min: ${query}`,
      async run({ query, minutes = 30 }) {
        if (!query || query.length > 600) return { error: 'the query must be between 1 and 600 characters' };
        const stepSeconds = Math.max(15, Math.round((minutes * 60) / 30));
        const series = await prometheus.queryRange(query, { start: before(minutes), end: anchor, stepSeconds });
        return {
          from: before(minutes).toISOString(),
          to: anchor.toISOString(),
          total: series.length,
          series: series
            .slice(0, 10)
            .map(({ labels, points }) => ({ labels: cleanLabels(labels), ...summarise(points, anchor) })),
        };
      },
    },

    {
      name: 'search_logs',
      description:
        "Search a service's logs in Loki. Identical entries are grouped, with counts, first/last time, the exception (type, message, first stack frame in our code), versions and an example trace id.",
      parameters: {
        type: 'object',
        properties: {
          service: serviceArg,
          level: { type: 'string', enum: ['error', 'warn', 'info', 'any'], description: 'Default error.' },
          contains: { type: 'string', description: 'Only lines containing this text (optional).' },
          minutes: { type: 'integer', minimum: 1, maximum: 180, description: 'How far back to look (default 15).' },
        },
        required: ['service'],
      },
      title: ({ service, level = 'error', contains, minutes = 15 }) =>
        `${level === 'any' ? 'All' : capitalise(level)} logs of ${service}${contains ? ` containing "${contains}"` : ''}, last ${minutes} min`,
      async run({ service, level = 'error', contains, minutes = 15 }) {
        if (!SERVICE_NAME.test(service ?? '')) return { error: 'service must be a service name like checkout' };
        let query = `{service_name="${service}"}`;
        if (level !== 'any') query += ` | detected_level="${level}"`;
        if (contains) query += ` |= ${JSON.stringify(String(contains).slice(0, 200))}`;

        const [records, levels] = await Promise.all([
          loki.logs(query, { start: before(minutes), end: anchor, limit: 300 }),
          loki.metric(`sum by (detected_level) (count_over_time({service_name="${service}"}[${minutes}m]))`, anchor),
        ]);
        return {
          logql: query,
          linesByLevel: Object.fromEntries(
            levels.map(({ labels, value }) => [labels.detected_level ?? 'unknown', value]),
          ),
          matched: records.length,
          groups: groupLogs(records),
        };
      },
    },

    {
      name: 'find_traces',
      description:
        'Find recent traces that went through a service (optionally only failed or slow ones) in Tempo. The top three come back condensed: every span with service, duration, offset and error message.',
      parameters: {
        type: 'object',
        properties: {
          service: serviceArg,
          errorsOnly: { type: 'boolean', description: 'Only traces where this service recorded an error.' },
          minDurationMs: { type: 'integer', minimum: 1, description: 'Only spans of this service slower than this.' },
          minutes: { type: 'integer', minimum: 1, maximum: 60, description: 'How far back to look (default 15).' },
        },
        required: ['service'],
      },
      title: ({ service, errorsOnly, minDurationMs }) =>
        `Traces through ${service}${errorsOnly ? ' with errors' : ''}${minDurationMs ? ` slower than ${minDurationMs} ms` : ''}`,
      async run({ service, errorsOnly = false, minDurationMs, minutes = 15 }) {
        if (!SERVICE_NAME.test(service ?? '')) return { error: 'service must be a service name like checkout' };
        const conditions = [`resource.service.name = "${service}"`];
        if (errorsOnly) conditions.push('status = error');
        if (minDurationMs) conditions.push(`duration > ${Math.round(minDurationMs)}ms`);
        const traceql = `{ ${conditions.join(' && ')} }`;

        const found = await tempo.search(traceql, { start: before(minutes), end: anchor, limit: 10 });
        const examples = await Promise.all(
          found.slice(0, 3).map(async (trace) => ({
            traceId: trace.traceId,
            root: `${trace.rootService}: ${trace.rootName}`,
            startedAt: trace.startedAt,
            ...condenseTrace(await tempo.trace(trace.traceId)),
          })),
        );
        return {
          traceql,
          found: found.length,
          examples,
          others: found
            .slice(3)
            .map((trace) => ({ traceId: trace.traceId, root: trace.rootName, durationMs: trace.durationMs })),
        };
      },
    },

    {
      name: 'get_trace',
      description: 'Fetch one trace by id and return all of its spans, condensed.',
      parameters: { type: 'object', properties: { traceId: { type: 'string' } }, required: ['traceId'] },
      title: ({ traceId = '' }) => `Trace ${traceId.slice(0, 12)}…`,
      async run({ traceId }) {
        if (!TRACE_ID.test(traceId ?? '')) return { error: 'traceId must be 16 to 32 hex characters' };
        const trace = await tempo.trace(traceId);
        return trace ? { traceId, ...condenseTrace(trace) } : { error: `no trace ${traceId}` };
      },
    },
  ];

  const byName = new Map(tools.map((tool) => [tool.name, tool]));

  return {
    declarations: tools.map(({ name, description, parameters }) => ({
      name,
      description,
      parametersJsonSchema: parameters,
    })),
    has: (name) => byName.has(name),
    title: (name, args = {}) => byName.get(name).title(args),
    // Tool failures (bad PromQL, unknown service) go back to the model as an error it can
    // correct, rather than ending the investigation.
    async run(name, args = {}) {
      try {
        return fit(await byName.get(name).run(args));
      } catch (err) {
        return { error: err.message };
      }
    },
  };
}

function cleanLabels(labels) {
  return Object.fromEntries(Object.entries(labels).filter(([key]) => !NOISY_LABELS.has(key)));
}

function summarise(points, anchor) {
  const values = points.map(([, v]) => v).filter(Number.isFinite);
  if (values.length === 0) return { samples: [] };
  const stride = Math.max(1, Math.ceil(points.length / 15));
  return {
    first: round(values[0]),
    last: round(values.at(-1)),
    min: round(Math.min(...values)),
    max: round(Math.max(...values)),
    mean: round(values.reduce((sum, v) => sum + v, 0) / values.length),
    samples: points
      .filter((_, i) => i % stride === 0 || i === points.length - 1)
      .map(([t, v]) => [Math.round((t - anchor.getTime()) / 60_000), round(v)]),
  };
}

function round(value) {
  return Number.isFinite(value) ? Number(value.toPrecision(4)) : null;
}

function capitalise(text) {
  return text[0].toUpperCase() + text.slice(1);
}

// Halves the longest list in the result until it fits, and says so.
function fit(result) {
  if (JSON.stringify(result).length <= MAX_RESULT_CHARS) return result;
  const trimmed = structuredClone(result);
  for (let pass = 0; pass < 8 && JSON.stringify(trimmed).length > MAX_RESULT_CHARS; pass += 1) {
    const longest = longestArray(trimmed);
    if (!longest || longest.length <= 1) break;
    longest.splice(Math.ceil(longest.length / 2));
  }
  return { ...trimmed, truncated: true };
}

function longestArray(value, best = null) {
  if (Array.isArray(value)) {
    if (!best || JSON.stringify(value).length > JSON.stringify(best).length) best = value;
    for (const item of value) best = longestArray(item, best);
  } else if (value && typeof value === 'object') {
    for (const item of Object.values(value)) best = longestArray(item, best);
  }
  return best;
}
