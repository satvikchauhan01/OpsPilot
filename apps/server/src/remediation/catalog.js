import { z } from 'zod';
import { imageVersion } from '../changes/diff.js';

// The only things OpsPilot can do to the cluster. A proposal from the model or from a person
// that isn't one of these, with valid parameters, is refused before anything runs.
export const ACTION_TYPES = ['rollback', 'restart', 'scale'];
export const MAX_REPLICAS = 6;

export const ACTION_LABEL = { rollback: 'Roll back', restart: 'Restart', scale: 'Scale' };
const DONE_LABEL = { rollback: 'Rolled back', restart: 'Restarted', scale: 'Scaled' };

const service = z.string().regex(/^[a-z0-9][a-z0-9-]{0,62}$/, 'service must be a Deployment name like checkout');

const actionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('rollback'), params: z.object({ service }).strict() }),
  z.object({ type: z.literal('restart'), params: z.object({ service }).strict() }),
  z.object({
    type: z.literal('scale'),
    params: z
      .object({
        service,
        replicas: z
          .number()
          .int()
          .min(1, 'scale to at least 1 replica')
          .max(MAX_REPLICAS, `scale to ${MAX_REPLICAS} replicas at most`),
      })
      .strict(),
  }),
]);

// { ok: true, action: { type, params } } or { ok: false, error } with a readable reason.
export function parseAction(input) {
  const parsed = actionSchema.safeParse(input);
  if (parsed.success) return { ok: true, action: parsed.data };
  return { ok: false, error: parsed.error.issues.map((issue) => issue.message).join('; ') };
}

// "Roll back checkout 1.4.2 → 1.4.1 (revision 38 → 37)"
export function describeAction({ type, plan }) {
  return `${ACTION_LABEL[type]} ${plan.summary}`;
}

// "Rolled back checkout 1.4.2 → 1.4.1 (revision 38 → 37)"
export function describeDone({ type, plan }) {
  return `${DONE_LABEL[type]} ${plan.summary}`;
}

export function revisionOf(object) {
  return Number(object?.metadata?.annotations?.['deployment.kubernetes.io/revision']) || 0;
}

export function versionOf(template) {
  const image = template?.spec?.containers?.[0]?.image;
  return image ? imageVersion(image) : 'unknown';
}

// The ReplicaSet holding the revision before the one the Deployment runs now, or null when
// there is nothing to go back to.
export function previousRevision(deployment, replicaSets) {
  const current = revisionOf(deployment);
  return (
    replicaSets
      .filter((rs) => rs.metadata?.ownerReferences?.some((owner) => owner.uid === deployment.metadata.uid))
      .filter((rs) => revisionOf(rs) > 0 && revisionOf(rs) < current)
      .sort((a, b) => revisionOf(b) - revisionOf(a))[0] ?? null
  );
}

// An old ReplicaSet's pod template, ready to put back on its Deployment. The pod-template-hash
// label belongs to the ReplicaSet and is added again by Kubernetes, the way kubectl rollout
// undo does it.
export function templateToRestore(replicaSet) {
  const template = structuredClone(replicaSet.spec.template);
  if (template.metadata?.labels) delete template.metadata.labels['pod-template-hash'];
  return template;
}

// Whether a Deployment has finished rolling out: the controller has seen the latest spec, and
// every replica is updated, available, and no old pod is left.
export function rolloutDone(deployment) {
  const wanted = deployment.spec?.replicas ?? 1;
  const status = deployment.status ?? {};
  return (
    (status.observedGeneration ?? 0) >= (deployment.metadata?.generation ?? 0) &&
    (status.updatedReplicas ?? 0) === wanted &&
    (status.replicas ?? 0) === wanted &&
    (status.availableReplicas ?? 0) === wanted
  );
}
