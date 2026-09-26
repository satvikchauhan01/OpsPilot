import { setTimeout as sleep } from 'node:timers/promises';
import { PatchStrategy, setHeaderOptions } from '@kubernetes/client-node';
import { previousRevision, revisionOf, rolloutDone, templateToRestore, versionOf } from './catalog.js';

const ROLLOUT_TIMEOUT_MS = 4 * 60_000;

export class PlanError extends Error {}

/**
 * Plans and runs catalog actions against the monitored namespace. Planning only reads (with
 * OpsPilot's reader credentials); running patches the Deployment as the opspilot-executor
 * service account and nothing else.
 */
export function createExecutor({ reader, executor, namespace }) {
  async function readDeployment(service) {
    const deployment = await reader.apps.readNamespacedDeployment({ name: service, namespace }).catch(() => null);
    if (!deployment) throw new PlanError(`there is no deployment called ${service}`);
    return deployment;
  }

  async function previousOf(deployment) {
    const replicaSets = await reader.apps.listNamespacedReplicaSet({
      namespace,
      labelSelector: `app.kubernetes.io/name=${deployment.metadata.name}`,
    });
    return previousRevision(deployment, replicaSets.items);
  }

  // Works out what an action would do right now. The plan is shown to the approver, and
  // checked again just before running, in case the Deployment changed in between.
  async function plan({ type, params }) {
    const deployment = await readDeployment(params.service);
    const replicas = deployment.spec.replicas ?? 1;
    const version = versionOf(deployment.spec.template);

    if (type === 'rollback') {
      const target = await previousOf(deployment);
      if (!target) throw new PlanError(`${params.service} has no earlier revision to roll back to`);
      const from = { revision: revisionOf(deployment), version };
      const to = { revision: revisionOf(target), version: versionOf(target.spec.template) };
      return {
        service: params.service,
        from,
        to,
        replicas,
        summary: `${params.service} ${from.version} → ${to.version} (revision ${from.revision} → ${to.revision})`,
      };
    }
    if (type === 'restart') {
      return {
        service: params.service,
        version,
        replicas,
        summary: `${params.service} (${replicas} pods, ${version})`,
      };
    }
    if (params.replicas === replicas) throw new PlanError(`${params.service} already runs ${replicas} replicas`);
    return {
      service: params.service,
      from: { replicas },
      to: { replicas: params.replicas },
      summary: `${params.service} ${replicas} → ${params.replicas} replicas`,
    };
  }

  // Applies an approved action. `cause` ends up in the rollout history, so `kubectl rollout
  // history` shows why this revision exists.
  async function run({ type, params }, { cause }) {
    const name = params.service;

    if (type === 'rollback') {
      const target = await previousOf(await readDeployment(name));
      if (!target) throw new Error(`${name} has no earlier revision to roll back to`);
      await executor.apps.patchNamespacedDeployment(
        {
          name,
          namespace,
          body: [
            { op: 'replace', path: '/spec/template', value: templateToRestore(target) },
            { op: 'add', path: '/metadata/annotations/kubernetes.io~1change-cause', value: cause },
          ],
        },
        setHeaderOptions('Content-Type', PatchStrategy.JsonPatch),
      );
    } else if (type === 'restart') {
      await executor.apps.patchNamespacedDeployment(
        {
          name,
          namespace,
          body: {
            metadata: { annotations: { 'kubernetes.io/change-cause': cause } },
            spec: {
              template: {
                metadata: { annotations: { 'kubectl.kubernetes.io/restartedAt': new Date().toISOString() } },
              },
            },
          },
        },
        setHeaderOptions('Content-Type', PatchStrategy.StrategicMergePatch),
      );
    } else {
      await executor.apps.patchNamespacedDeploymentScale(
        { name, namespace, body: { spec: { replicas: params.replicas } } },
        setHeaderOptions('Content-Type', PatchStrategy.MergePatch),
      );
    }
  }

  async function waitForRollout(service, { onProgress } = {}) {
    const deadline = Date.now() + ROLLOUT_TIMEOUT_MS;
    for (;;) {
      const deployment = await executor.apps.readNamespacedDeployment({ name: service, namespace });
      if (rolloutDone(deployment)) return;

      const progressing = deployment.status?.conditions?.find((condition) => condition.type === 'Progressing');
      if (progressing?.reason === 'ProgressDeadlineExceeded')
        throw new Error(`the rollout stalled: ${progressing.message}`);
      if (Date.now() > deadline) throw new Error('the rollout did not finish within 4 minutes');

      await onProgress?.({
        updated: deployment.status?.updatedReplicas ?? 0,
        available: deployment.status?.availableReplicas ?? 0,
        wanted: deployment.spec?.replicas ?? 1,
      });
      await sleep(2000);
    }
  }

  async function replicasOf(service) {
    return (await readDeployment(service)).spec.replicas ?? 1;
  }

  return { enabled: Boolean(executor), plan, run, waitForRollout, replicasOf };
}
