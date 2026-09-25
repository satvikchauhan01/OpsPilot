// Turns Kubernetes Deployments into small comparable snapshots and describes what changed
// between two of them in words an on-call engineer would use.

const SENSITIVE_NAME = /secret|token|password|passwd|key|credential/i;

export function snapshotDeployment(deployment) {
  const annotations = deployment.metadata?.annotations ?? {};
  const template = deployment.spec?.template ?? {};

  return {
    generation: deployment.metadata?.generation ?? 0,
    replicas: deployment.spec?.replicas ?? 1,
    revision: Number(annotations['deployment.kubernetes.io/revision']) || null,
    changeCause: annotations['kubernetes.io/change-cause'] ?? null,
    restartedAt: template.metadata?.annotations?.['kubectl.kubernetes.io/restartedAt'] ?? null,
    containers: (template.spec?.containers ?? []).map((container) => ({
      name: container.name,
      image: container.image,
      env: Object.fromEntries((container.env ?? []).map((variable) => [variable.name, describeEnvValue(variable)])),
      resources: container.resources ?? {},
    })),
  };
}

export function diffDeployments(name, before, after) {
  const changes = [];

  if (before.replicas !== after.replicas) {
    changes.push({
      kind: 'scale',
      summary: `${name} scaled from ${before.replicas} to ${after.replicas} replicas`,
      details: { from: before.replicas, to: after.replicas },
    });
  }

  for (const container of after.containers) {
    const previous = before.containers.find((c) => c.name === container.name);
    if (!previous) continue;

    if (previous.image !== container.image) {
      changes.push({
        kind: 'deploy',
        summary: `${name} ${imageVersion(previous.image)} → ${imageVersion(container.image)}`,
        details: {
          container: container.name,
          from: previous.image,
          to: container.image,
          revision: after.revision,
          changeCause: after.changeCause,
        },
      });
    }

    const env = diffEnv(previous.env, container.env);
    if (env.length > 0) {
      changes.push({
        kind: 'config',
        summary: `${name} settings changed: ${env.map((change) => change.name).join(', ')}`,
        details: { container: container.name, env },
      });
    }

    if (JSON.stringify(previous.resources) !== JSON.stringify(container.resources)) {
      changes.push({
        kind: 'config',
        summary: `${name} resource requests or limits changed`,
        details: { container: container.name, from: previous.resources, to: container.resources },
      });
    }
  }

  if (after.restartedAt && after.restartedAt !== before.restartedAt) {
    changes.push({ kind: 'restart', summary: `${name} rolling restart`, details: { restartedAt: after.restartedAt } });
  }

  return changes;
}

// "shop.local/checkout:1.4.2" -> "1.4.2". A registry port ("host:5000/x") is not a tag.
export function imageVersion(image) {
  const lastPart = image.split('/').pop();
  return lastPart.includes(':') ? lastPart.slice(lastPart.lastIndexOf(':') + 1) : 'latest';
}

// Pods are named <deployment>-<replicaset hash>-<pod hash>. The label is preferred when present.
export function serviceOfPod(pod) {
  return pod.metadata?.labels?.['app.kubernetes.io/name'] ?? serviceFromPodName(pod.metadata?.name ?? '');
}

export function serviceFromPodName(name) {
  const match = /^(.+)-[a-z0-9]{5,10}-[a-z0-9]{5}$/.exec(name);
  return match ? match[1] : name;
}

function describeEnvValue({ name, value, valueFrom }) {
  if (value !== undefined) return SENSITIVE_NAME.test(name) ? '••••••' : value;
  if (valueFrom?.secretKeyRef) return `secret ${valueFrom.secretKeyRef.name}/${valueFrom.secretKeyRef.key}`;
  if (valueFrom?.configMapKeyRef) return `configmap ${valueFrom.configMapKeyRef.name}/${valueFrom.configMapKeyRef.key}`;
  if (valueFrom?.fieldRef) return `field ${valueFrom.fieldRef.fieldPath}`;
  return '';
}

function diffEnv(before, after) {
  const names = new Set([...Object.keys(before), ...Object.keys(after)]);
  return [...names]
    .filter((name) => before[name] !== after[name])
    .map((name) => ({ name, from: before[name] ?? null, to: after[name] ?? null }));
}
