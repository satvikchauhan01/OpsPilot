import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { PlanError, createExecutor } from '../src/remediation/executor.js';

const NAMESPACE = 'shop';

function template(version, hash) {
  return {
    metadata: { labels: { 'app.kubernetes.io/name': 'checkout', 'pod-template-hash': hash } },
    spec: { containers: [{ name: 'checkout', image: `shop.local/checkout:${version}` }] },
  };
}

function deployment({ revision = 5, version = '1.4.2', replicas = 2 } = {}) {
  return {
    metadata: {
      name: 'checkout',
      uid: 'uid-checkout',
      annotations: { 'deployment.kubernetes.io/revision': String(revision) },
    },
    spec: { replicas, template: template(version, 'current') },
  };
}

function replicaSet(revision, version, { owner = 'uid-checkout' } = {}) {
  return {
    metadata: {
      name: `checkout-${revision}`,
      annotations: { 'deployment.kubernetes.io/revision': String(revision) },
      ownerReferences: [{ uid: owner }],
    },
    spec: { template: template(version, `hash${revision}`) },
  };
}

// The reader can only read and the executor can only patch, like the two service accounts.
function fakeCluster({ current = deployment(), replicaSets = [] } = {}) {
  const patches = [];
  const reader = {
    apps: {
      async readNamespacedDeployment({ name, namespace }) {
        if (name !== current.metadata.name || namespace !== NAMESPACE) throw new Error('404 not found');
        return structuredClone(current);
      },
      async listNamespacedReplicaSet({ namespace, labelSelector }) {
        assert.equal(namespace, NAMESPACE);
        assert.equal(labelSelector, 'app.kubernetes.io/name=checkout');
        return { items: replicaSets };
      },
    },
  };
  const executor = {
    apps: {
      async patchNamespacedDeployment(request, options) {
        patches.push({ kind: 'deployment', request, contentType: contentType(options) });
      },
      async patchNamespacedDeploymentScale(request, options) {
        patches.push({ kind: 'scale', request, contentType: contentType(options) });
      },
    },
  };
  return { patches, executor: createExecutor({ reader, executor, namespace: NAMESPACE }) };
}

// The client sets the patch type through a request middleware; run it on a stand-in request.
function contentType(options) {
  const headers = {};
  for (const middleware of options.middleware)
    middleware.pre({ setHeaderParam: (name, value) => (headers[name] = value) });
  return headers['Content-Type'];
}

const CAUSE = 'OpsPilot INC-7: Roll back checkout 1.4.2 → 1.4.1 (revision 5 → 4), approved by Dana';

describe('executor: rollback', () => {
  const previous = replicaSet(4, '1.4.1');
  const replicaSets = [
    // Another Deployment's history must never be picked, even listed first
    replicaSet(4, '9.9.9', { owner: 'uid-gateway' }),
    replicaSet(3, '1.4.0'),
    previous,
    replicaSet(5, '1.4.2'),
  ];

  it('plans the step back to the previous revision', async () => {
    const { executor, patches } = fakeCluster({ replicaSets });
    const plan = await executor.plan({ type: 'rollback', params: { service: 'checkout' } });

    assert.equal(plan.summary, 'checkout 1.4.2 → 1.4.1 (revision 5 → 4)');
    assert.deepEqual(plan.from, { revision: 5, version: '1.4.2' });
    assert.deepEqual(plan.to, { revision: 4, version: '1.4.1' });
    assert.equal(patches.length, 0);
  });

  it("puts the previous revision's pod template back as a JSON Patch, with the reason", async () => {
    const { executor, patches } = fakeCluster({ replicaSets });
    await executor.run({ type: 'rollback', params: { service: 'checkout' } }, { cause: CAUSE });

    assert.equal(patches.length, 1);
    const [{ kind, request, contentType }] = patches;
    assert.equal(kind, 'deployment');
    assert.equal(contentType, 'application/json-patch+json');
    assert.equal(request.name, 'checkout');
    assert.equal(request.namespace, NAMESPACE);

    const restored = template('1.4.1', 'hash4');
    // The ReplicaSet's own label goes; Kubernetes adds it again for the new revision
    delete restored.metadata.labels['pod-template-hash'];
    assert.deepEqual(request.body, [
      { op: 'replace', path: '/spec/template', value: restored },
      { op: 'add', path: '/metadata/annotations/kubernetes.io~1change-cause', value: CAUSE },
    ]);
    // Taken from a copy: the ReplicaSet it came from is left alone
    assert.equal(previous.spec.template.metadata.labels['pod-template-hash'], 'hash4');
  });
});

describe('executor: refusals', () => {
  it('refuses to scale to the number of replicas already running', async () => {
    const { executor, patches } = fakeCluster({ current: deployment({ replicas: 2 }) });

    await assert.rejects(executor.plan({ type: 'scale', params: { service: 'checkout', replicas: 2 } }), (err) => {
      assert.ok(err instanceof PlanError);
      assert.equal(err.message, 'checkout already runs 2 replicas');
      return true;
    });
    assert.equal(patches.length, 0);
  });

  it('plans and runs a real scale-up as a merge patch of the scale', async () => {
    const { executor, patches } = fakeCluster({ current: deployment({ replicas: 2 }) });
    const action = { type: 'scale', params: { service: 'checkout', replicas: 4 } };

    assert.equal((await executor.plan(action)).summary, 'checkout 2 → 4 replicas');
    await executor.run(action, { cause: 'scale for the flash sale' });
    assert.deepEqual(patches, [
      {
        kind: 'scale',
        request: { name: 'checkout', namespace: NAMESPACE, body: { spec: { replicas: 4 } } },
        contentType: 'application/merge-patch+json',
      },
    ]);
  });

  it('refuses a rollback when there is no earlier revision', async () => {
    const { executor, patches } = fakeCluster({
      // Revision 1 is long gone from the history. A ReplicaSet without a revision, and an older
      // one of another Deployment, are no way back either.
      current: deployment({ revision: 2, version: '1.4.1' }),
      replicaSets: [replicaSet(2, '1.4.1'), replicaSet(0, '1.3.0'), replicaSet(1, '0.9.0', { owner: 'uid-other' })],
    });
    const rollback = { type: 'rollback', params: { service: 'checkout' } };

    await assert.rejects(executor.plan(rollback), (err) => {
      assert.ok(err instanceof PlanError);
      assert.equal(err.message, 'checkout has no earlier revision to roll back to');
      return true;
    });
    // Checked again at run time, in case the history changed after the approval
    await assert.rejects(executor.run(rollback, { cause: CAUSE }), /checkout has no earlier revision to roll back to/);
    assert.equal(patches.length, 0);
  });

  it('refuses a service without a Deployment', async () => {
    const { executor } = fakeCluster();
    await assert.rejects(
      executor.plan({ type: 'restart', params: { service: 'billing' } }),
      (err) => err instanceof PlanError && err.message === 'there is no deployment called billing',
    );
  });
});
