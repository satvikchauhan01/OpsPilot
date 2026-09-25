import { makeInformer } from '@kubernetes/client-node';
import { Change } from '../models/change.js';
import { Workload } from '../models/workload.js';
import { bus } from '../realtime/bus.js';
import { logger } from '../logger.js';
import { createSerialQueue } from '../lib/serial-queue.js';
import { diffDeployments, imageVersion, serviceFromPodName, serviceOfPod, snapshotDeployment } from './diff.js';

const RETRY_MS = 5000;
// Restarts that happened shortly before OpsPilot started are still worth recording.
const RESTART_BACKFILL_MS = 60 * 60_000;

// Watches the monitored namespace and records what changed: Deployment edits (images,
// replicas, settings, restarts), rollout outcomes, container restarts and Warning events.
export function startChangeTracker({ kube, namespace }) {
  const workloads = new Map();
  const pendingRollouts = new Map();
  const restartCounts = new Map();
  const enqueue = createSerialQueue();

  const informers = [
    watch(
      `/apis/apps/v1/namespaces/${namespace}/deployments`,
      () => kube.apps.listNamespacedDeployment({ namespace }),
      {
        add: onDeployment,
        update: onDeployment,
        delete: (deployment) => workloads.delete(deployment.metadata.name),
      },
    ),
    watch(`/api/v1/namespaces/${namespace}/pods`, () => kube.core.listNamespacedPod({ namespace }), {
      add: onPod,
      update: onPod,
    }),
    watch(`/api/v1/namespaces/${namespace}/events`, () => kube.core.listNamespacedEvent({ namespace }), {
      add: onEvent,
      update: onEvent,
    }),
  ];

  function watch(path, list, handlers) {
    const informer = makeInformer(kube.kc, path, list);
    let retrying = false;

    const retry = (err) => {
      if (retrying) return;
      retrying = true;
      logger.warn({ path, err: err?.message ?? String(err) }, 'Kubernetes watch failed, retrying');
      setTimeout(() => {
        retrying = false;
        informer.start().catch(retry);
      }, RETRY_MS);
    };

    for (const [verb, handler] of Object.entries(handlers)) {
      informer.on(verb, (object) =>
        enqueue(() => handler(object)).catch((err) => logger.error({ err }, 'change tracking failed')),
      );
    }
    informer.on('error', retry);
    informer.start().catch(retry);
    return informer;
  }

  async function onDeployment(deployment) {
    const name = deployment.metadata.name;
    const snapshot = snapshotDeployment(deployment);
    const previous = workloads.get(name)?.snapshot ?? (await storedSnapshot(name));
    const isFirstSighting = !workloads.has(name);
    workloads.set(name, { snapshot, status: statusOf(deployment) });

    if (previous && previous.generation !== snapshot.generation) {
      for (const change of diffDeployments(name, previous, snapshot)) {
        await record({
          ...change,
          service: name,
          at: new Date(),
          details: { ...change.details, ...(isFirstSighting && { detectedAtStartup: true }) },
        });
        if (change.kind !== 'scale') {
          pendingRollouts.set(name, {
            generation: snapshot.generation,
            since: Date.now(),
            revision: snapshot.revision,
          });
        }
      }
    }
    if (!previous || previous.generation !== snapshot.generation) {
      await Workload.updateOne({ namespace, name }, { snapshot, generation: snapshot.generation }, { upsert: true });
    }
    await checkRollout(deployment);
  }

  async function storedSnapshot(name) {
    const stored = await Workload.findOne({ namespace, name }).lean();
    return stored?.snapshot ?? null;
  }

  async function checkRollout(deployment) {
    const name = deployment.metadata.name;
    const pending = pendingRollouts.get(name);
    if (!pending) return;

    const { spec, status = {} } = deployment;
    const stalled = status.conditions?.find((c) => c.type === 'Progressing' && c.reason === 'ProgressDeadlineExceeded');
    const finished =
      (status.observedGeneration ?? 0) >= pending.generation &&
      status.updatedReplicas === spec.replicas &&
      status.availableReplicas === spec.replicas &&
      !status.unavailableReplicas;

    if (!finished && !stalled) return;
    pendingRollouts.delete(name);

    const seconds = Math.round((Date.now() - pending.since) / 1000);
    const revision = Number(deployment.metadata.annotations?.['deployment.kubernetes.io/revision']) || pending.revision;
    await record({
      kind: 'rollout',
      service: name,
      at: new Date(),
      summary: stalled ? `${name} rollout stalled` : `${name} rollout finished in ${seconds}s (revision ${revision})`,
      details: { revision, seconds, outcome: stalled ? 'stalled' : 'finished', message: stalled?.message },
    });
  }

  async function onPod(pod) {
    for (const container of pod.status?.containerStatuses ?? []) {
      const key = `${pod.metadata.uid}/${container.name}`;
      const known = restartCounts.get(key);
      restartCounts.set(key, container.restartCount);

      const terminated = container.lastState?.terminated;
      if (!terminated || container.restartCount === 0) continue;
      if (known !== undefined && container.restartCount <= known) continue;

      const finishedAt = new Date(terminated.finishedAt ?? Date.now());
      if (known === undefined && Date.now() - finishedAt > RESTART_BACKFILL_MS) continue;

      const reason = terminated.reason ?? `exit code ${terminated.exitCode}`;
      await record({
        kind: 'pod_restart',
        service: serviceOfPod(pod),
        at: finishedAt,
        summary: `${pod.metadata.name} restarted (${reason})`,
        details: {
          pod: pod.metadata.name,
          container: container.name,
          reason: terminated.reason,
          exitCode: terminated.exitCode,
          restartCount: container.restartCount,
        },
        source: `restart:${key}/${container.restartCount}`,
      });
    }
  }

  async function onEvent(event) {
    if (event.type !== 'Warning') return;

    const object = event.involvedObject ?? {};
    const firstSeen = event.firstTimestamp ?? event.eventTime ?? event.metadata.creationTimestamp;
    await record({
      kind: 'warning',
      service: serviceOfObject(object),
      at: new Date(firstSeen),
      summary: `${event.reason}: ${truncate(event.message ?? '', 160)}`,
      details: { reason: event.reason, message: event.message, object: `${object.kind}/${object.name}` },
      source: `event:${event.metadata.uid}`,
      occurrences: event.count ?? 1,
      lastSeenAt: new Date(event.lastTimestamp ?? firstSeen),
    });
  }

  async function record({ source, occurrences, lastSeenAt, ...change }) {
    const doc = { ...change, namespace };
    if (!source) {
      const created = await Change.create(doc);
      bus.publish('change', created.toJSON());
      return;
    }

    const result = await Change.findOneAndUpdate(
      { source },
      {
        $setOnInsert: { ...doc, source },
        $set: { occurrences: occurrences ?? 1, lastSeenAt: lastSeenAt ?? change.at },
      },
      { upsert: true, returnDocument: 'after', includeResultMetadata: true },
    );
    if (!result.lastErrorObject?.updatedExisting) bus.publish('change', result.value.toJSON());
  }

  return {
    workloads() {
      return [...workloads.entries()].map(([name, { snapshot, status }]) => ({
        name,
        version: snapshot.containers[0] ? imageVersion(snapshot.containers[0].image) : null,
        revision: snapshot.revision,
        ...status,
      }));
    },
    stop: () => Promise.allSettled(informers.map((informer) => informer.stop())),
  };
}

function statusOf(deployment) {
  const { spec, status = {} } = deployment;
  return {
    desired: spec.replicas ?? 1,
    ready: status.readyReplicas ?? 0,
    available: status.availableReplicas ?? 0,
    updated: status.updatedReplicas ?? 0,
  };
}

function serviceOfObject({ kind, name = '' }) {
  if (kind === 'Pod') return serviceFromPodName(name);
  if (kind === 'ReplicaSet') return name.replace(/-[a-z0-9]{5,10}$/, '');
  return name;
}

function truncate(text, max) {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}
