import { finite } from '../telemetry/prometheus.js';
import { buildGraph } from './graph.js';
import { logger } from '../logger.js';

const REFRESH_MS = 30_000;

// Service-level queries shared by the topology, the overview and the incident charts.
export function serviceQueries(namespace, window = '2m') {
  const scope = `namespace="${namespace}"`;
  const requests = `sum by (service) (rate(http_requests_total{${scope}}[${window}]))`;
  return {
    rps: requests,
    // Without any 5xx the numerator has no series at all; `or ... * 0` turns that into a 0
    // for every service that has traffic, instead of "no data".
    errorRatio:
      `(sum by (service) (rate(http_requests_total{${scope}, status_code=~"5.."}[${window}])) or ${requests} * 0)` +
      ` / ${requests}`,
    p95: `histogram_quantile(0.95, sum by (service, le) (rate(http_request_duration_seconds_bucket{${scope}}[${window}])))`,
    memory: `max by (service) (label_replace(
        container_memory_working_set_bytes{${scope}, pod!="", container=""}
          / on (namespace, pod) group_left
        sum by (namespace, pod) (kube_pod_container_resource_limits{${scope}, resource="memory"}),
        "service", "$1", "pod", "(.+)-[a-z0-9]+-[a-z0-9]{5}"))`,
    saturation: `sum by (service) (avg_over_time(worker_pool_busy{${scope}}[1m])) / sum by (service) (avg_over_time(worker_pool_size{${scope}}[1m]))`,
  };
}

// Reads the dependency graph and per-service health from Prometheus at a point in time.
export async function loadTopology(prometheus, namespace, at) {
  const queries = serviceQueries(namespace);
  const [calls, failures, rps, errorRatio, p95] = await Promise.all([
    prometheus.query('sum by (client, server) (rate(traces_service_graph_request_total[5m]))', at),
    prometheus.query('sum by (client, server) (rate(traces_service_graph_request_failed_total[5m]))', at),
    prometheus.query(queries.rps, at),
    prometheus.query(queries.errorRatio, at),
    prometheus.query(queries.p95, at),
  ]);

  const failed = new Map(failures.map(({ labels, value }) => [`${labels.client}>${labels.server}`, value]));
  const edges = calls
    .filter(({ labels }) => labels.server !== 'unknown' && labels.client !== 'unknown')
    .map(({ labels, value }) => ({
      source: labels.client,
      target: labels.server,
      rps: value,
      errorRatio: value > 0 ? finite((failed.get(`${labels.client}>${labels.server}`) ?? 0) / value) : 0,
    }));

  const byService = (series) => new Map(series.map(({ labels, value }) => [labels.service, finite(value)]));
  const health = { rps: byService(rps), errorRatio: byService(errorRatio), p95: byService(p95) };

  const names = new Set(edges.flatMap((edge) => [edge.source, edge.target]));
  for (const name of health.rps.keys()) names.add(name);

  const nodes = [...names].sort().map((name) => ({
    id: name,
    kind: name === 'user' ? 'external' : 'service',
    rps: health.rps.get(name) ?? null,
    errorRatio: health.errorRatio.get(name) ?? null,
    p95: health.p95.get(name) ?? null,
  }));

  return { at: new Date(at ?? Date.now()).toISOString(), nodes, edges };
}

// Keeps a fresh copy of the current topology for the correlator, which needs the graph on
// every alert and shouldn't wait for Prometheus each time. If Prometheus is unreachable the
// last known graph stays in use.
export function createTopologyCache(prometheus, namespace) {
  let current = { nodes: [], edges: [] };
  let graph = buildGraph([]);
  let timer = null;

  async function refresh() {
    try {
      current = await loadTopology(prometheus, namespace);
      graph = buildGraph(current.edges);
    } catch (err) {
      logger.warn({ err: err.message }, 'could not refresh topology, keeping the last known graph');
    }
  }

  return {
    async start() {
      await refresh();
      timer = setInterval(refresh, REFRESH_MS);
    },
    stop: () => clearInterval(timer),
    refresh,
    graph: () => graph,
    snapshot: () => current,
  };
}
