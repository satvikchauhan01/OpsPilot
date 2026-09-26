import { DemoState } from '../models/demo-state.js';
import { HttpError, notFound } from '../http/errors.js';
import { bus } from '../realtime/bus.js';
import { logger } from '../logger.js';
import { createSerialQueue } from '../lib/serial-queue.js';
import { createDemoCluster, withTag } from './cluster.js';
import { SCENARIOS, SHOP_SERVICES } from './scenarios.js';

const TICK_MS = 30_000;
const BAD_RELEASE = '1.4.2';
const FAULTS = {
  'memory-leak': ['inventory', { leakMbPerMin: 300 }],
  'payments-latency': ['payments', { latencyMs: 2500 }],
};
const SPIKE = { rps: 50, checkoutShare: 0.8 };

/**
 * Lets visitors break the demo shop from the UI (DP-4): one scenario at a time, a cooldown
 * after each reset so alerts can settle, and an automatic reset after a while, whatever the
 * visitor did in between.
 */
export function createDemoService({ client, config }) {
  const cluster = client ? createDemoCluster(client) : null;
  // A trigger and a reset never run at the same time.
  const enqueue = createSerialQueue();

  async function state() {
    return (await DemoState.findById('demo').lean()) ?? { active: null };
  }

  function cooldownUntil(current) {
    if (!current.lastResetAt) return null;
    const until = new Date(new Date(current.lastResetAt).getTime() + config.demo.cooldownMs);
    return until > new Date() ? until : null;
  }

  function publish() {
    bus.publish('demo.updated', {});
  }

  async function status() {
    const current = await state();
    return {
      enabled: Boolean(cluster),
      scenarios: SCENARIOS,
      active: current.active && {
        key: current.active.key,
        startedAt: current.active.startedAt,
        by: current.active.by,
        resetAt: current.active.resetAt,
      },
      cooldownUntil: cooldownUntil(current),
      resetMinutes: config.demo.resetMs / 60_000,
    };
  }

  function requireCluster() {
    if (!cluster) throw new HttpError(503, 'demo control is off: set KUBE_DEMO_TOKEN (npm run cluster:up writes it)');
  }

  function trigger(key, { by }) {
    return enqueue(async () => {
      requireCluster();
      const scenario = SCENARIOS.find((candidate) => candidate.key === key);
      if (!scenario) throw notFound('scenario');

      const current = await state();
      if (current.active) {
        const running = SCENARIOS.find((candidate) => candidate.key === current.active.key);
        throw new HttpError(
          409,
          `${running.title} is still running, and the shop resets itself at ${clock(current.active.resetAt)}`,
        );
      }
      const settling = cooldownUntil(current);
      if (settling)
        throw new HttpError(
          409,
          `the shop is still settling after the last scenario, try again after ${clock(settling)}`,
        );

      const baseline = await snapshot();
      await run(key);
      const startedAt = new Date();
      await DemoState.updateOne(
        { _id: 'demo' },
        { active: { key, startedAt, by, resetAt: new Date(startedAt.getTime() + config.demo.resetMs), baseline } },
        { upsert: true },
      );
      logger.info({ scenario: scenario.id, by }, 'demo scenario started');
      publish();
      return status();
    });
  }

  // The version and replica count of every shop Deployment, to put back later.
  async function snapshot() {
    return Promise.all(
      SHOP_SERVICES.map(async (name) => {
        const deployment = await cluster.readDeployment(name);
        const container = deployment.spec.template.spec.containers[0];
        return { name, container: container.name, image: container.image, replicas: deployment.spec.replicas };
      }),
    );
  }

  async function run(key) {
    if (key === 'bad-deploy') {
      const container = (await cluster.readDeployment('checkout')).spec.template.spec.containers[0];
      // Image and change-cause in one patch, so the release note lands on the new revision.
      await cluster.patchDeployment('checkout', {
        metadata: { annotations: { 'kubernetes.io/change-cause': `release ${BAD_RELEASE}` } },
        spec: {
          template: { spec: { containers: [{ name: container.name, image: withTag(container.image, BAD_RELEASE) }] } },
        },
      });
    } else if (key === 'traffic-spike') {
      await callLoadgen('POST', SPIKE);
    } else {
      const [service, faults] = FAULTS[key];
      for (const pod of await cluster.runningPods('shop', service)) {
        await cluster.callPod('shop', pod, 'POST', '/_chaos', faults);
      }
    }
  }

  async function callLoadgen(method, body) {
    const [pod] = await cluster.runningPods('loadgen', 'loadgen');
    if (!pod) throw new Error('the load generator is not running');
    return cluster.callPod('loadgen', pod, method, '/control', body);
  }

  // Puts the shop back as it was before the scenario: no injected faults, normal traffic, the
  // versions and replica counts from the snapshot, and a restart for any service that leaked
  // memory (a Node.js process doesn't give leaked memory back on its own).
  function reset({ by }) {
    return enqueue(async () => {
      requireCluster();
      const current = await state();

      const leaked = new Set();
      for (const service of SHOP_SERVICES) {
        for (const pod of await cluster.runningPods('shop', service)) {
          const cleared = await cluster.callPod('shop', pod, 'DELETE', '/_chaos').catch((err) => {
            logger.warn({ pod, err: err.message }, 'could not clear the faults of a pod');
            return null;
          });
          if (cleared?.leakedMb > 0) leaked.add(service);
        }
      }
      await callLoadgen('DELETE').catch((err) =>
        logger.warn({ err: err.message }, 'could not reset the load generator'),
      );

      for (const { name, container, image, replicas } of current.active?.baseline ?? []) {
        const deployment = await cluster.readDeployment(name);
        const live = deployment.spec.template.spec.containers.find((candidate) => candidate.name === container);
        if (live && live.image !== image) {
          await cluster.patchDeployment(name, {
            metadata: { annotations: { 'kubernetes.io/change-cause': 'demo reset' } },
            spec: { template: { spec: { containers: [{ name: container, image }] } } },
          });
        }
        if (deployment.spec.replicas !== replicas) await cluster.scale(name, replicas);
      }
      for (const service of leaked) await cluster.restart(service);

      await DemoState.updateOne(
        { _id: 'demo' },
        { active: null, lastResetAt: new Date(), lastResetBy: by },
        { upsert: true },
      );
      logger.info({ by, restarted: [...leaked] }, 'demo reset');
      publish();
      return status();
    });
  }

  function start() {
    if (!cluster) return;
    setInterval(() => {
      state()
        .then((current) => {
          if (current.active && new Date(current.active.resetAt) <= new Date()) return reset({ by: 'OpsPilot' });
        })
        .catch((err) => logger.warn({ err: err.message }, 'the automatic demo reset failed'));
    }, TICK_MS).unref();
  }

  return { status, trigger, reset, start };
}

function clock(date) {
  return `${new Date(date).toISOString().slice(11, 16)} UTC`;
}
