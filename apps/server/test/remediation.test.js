import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  describeAction,
  describeDone,
  parseAction,
  previousRevision,
  rolloutDone,
  templateToRestore,
} from '../src/remediation/catalog.js';
import { recommend } from '../src/remediation/recommend.js';
import { buildTimeline } from '../src/incidents/timeline.js';
import { minutes } from './fixtures.js';

describe('action catalog', () => {
  it('accepts the three actions with valid parameters', () => {
    assert.equal(parseAction({ type: 'rollback', params: { service: 'checkout' } }).ok, true);
    assert.equal(parseAction({ type: 'restart', params: { service: 'inventory' } }).ok, true);
    assert.equal(parseAction({ type: 'scale', params: { service: 'payments', replicas: 4 } }).ok, true);
  });

  it('refuses anything else', () => {
    const refused = [
      { type: 'delete', params: { service: 'checkout' } },
      { type: 'scale', params: { service: 'payments', replicas: 7 } },
      { type: 'scale', params: { service: 'payments', replicas: 0 } },
      { type: 'scale', params: { service: 'payments' } },
      { type: 'restart', params: { service: 'payments; rm -rf /' } },
      { type: 'restart', params: { service: 'payments', command: 'kubectl delete ns shop' } },
    ];
    for (const input of refused) assert.equal(parseAction(input).ok, false, JSON.stringify(input));
    assert.match(parseAction(refused[1]).error, /6 replicas at most/);
  });

  it('describes what an action does and what it did', () => {
    const action = { type: 'rollback', plan: { summary: 'checkout 1.4.2 → 1.4.1 (revision 38 → 37)' } };
    assert.equal(describeAction(action), 'Roll back checkout 1.4.2 → 1.4.1 (revision 38 → 37)');
    assert.equal(describeDone(action), 'Rolled back checkout 1.4.2 → 1.4.1 (revision 38 → 37)');
  });
});

describe('rollback target', () => {
  const deployment = { metadata: { uid: 'd1', annotations: { 'deployment.kubernetes.io/revision': '38' } } };
  const replicaSet = (revision, owner = 'd1', image = `shop.local/checkout:r${revision}`) => ({
    metadata: {
      ownerReferences: [{ uid: owner }],
      annotations: { 'deployment.kubernetes.io/revision': String(revision) },
    },
    spec: {
      template: {
        metadata: { labels: { 'app.kubernetes.io/name': 'checkout', 'pod-template-hash': 'abc' } },
        spec: { containers: [{ name: 'checkout', image }] },
      },
    },
  });

  it('picks the newest revision before the current one, of this deployment only', () => {
    const target = previousRevision(deployment, [
      replicaSet(36),
      replicaSet(38),
      replicaSet(37, 'other'),
      replicaSet(35),
    ]);
    assert.equal(target.metadata.annotations['deployment.kubernetes.io/revision'], '36');
  });

  it('finds nothing when there is no earlier revision', () => {
    assert.equal(previousRevision(deployment, [replicaSet(38)]), null);
  });

  it('restores the template without the ReplicaSet hash label, leaving the original alone', () => {
    const source = replicaSet(37);
    const template = templateToRestore(source);
    assert.deepEqual(template.metadata.labels, { 'app.kubernetes.io/name': 'checkout' });
    assert.equal(source.spec.template.metadata.labels['pod-template-hash'], 'abc');
  });
});

describe('rollout progress', () => {
  const deployment = (status, generation = 5) => ({ metadata: { generation }, spec: { replicas: 2 }, status });

  it('is done when every replica is new and available and the old ones are gone', () => {
    assert.equal(
      rolloutDone(deployment({ observedGeneration: 5, updatedReplicas: 2, replicas: 2, availableReplicas: 2 })),
      true,
    );
  });

  it('is not done while old pods remain, new ones are starting, or the change was not seen yet', () => {
    const cases = [
      { observedGeneration: 5, updatedReplicas: 2, replicas: 3, availableReplicas: 2 },
      { observedGeneration: 5, updatedReplicas: 1, replicas: 2, availableReplicas: 2 },
      { observedGeneration: 5, updatedReplicas: 2, replicas: 2, availableReplicas: 1 },
      { observedGeneration: 4, updatedReplicas: 2, replicas: 2, availableReplicas: 2 },
    ];
    for (const status of cases) assert.equal(rolloutDone(deployment(status)), false, JSON.stringify(status));
  });
});

describe('recommended fix', () => {
  const hypothesis = (suggestedAction, extra = {}) => ({ service: 'payments', suggestedAction, ...extra });

  it("follows the investigator's suggestion", () => {
    assert.deepEqual(recommend(hypothesis('rollback'), { currentReplicas: 2 }), {
      type: 'rollback',
      params: { service: 'payments' },
    });
    assert.deepEqual(recommend(hypothesis('restart'), { currentReplicas: 2 }), {
      type: 'restart',
      params: { service: 'payments' },
    });
  });

  it("sizes a scale-up from the model's number, or doubles it when that isn't a scale-up", () => {
    const scaled = (extra, currentReplicas) => recommend(hypothesis('scale_up', extra), { currentReplicas })?.params;
    assert.deepEqual(scaled({ replicas: 4 }, 2), { service: 'payments', replicas: 4 });
    assert.deepEqual(scaled({ replicas: 2 }, 2), { service: 'payments', replicas: 4 });
    assert.deepEqual(scaled({}, 4), { service: 'payments', replicas: 6 });
    assert.equal(scaled({}, 6), undefined);
  });

  it('falls back to what the runbooks recommend, and gives up without either', () => {
    assert.deepEqual(recommend(hypothesis('investigate'), { runbookActions: ['restart'], currentReplicas: 2 }), {
      type: 'restart',
      params: { service: 'payments' },
    });
    assert.equal(recommend(hypothesis('none'), { runbookActions: [], currentReplicas: 2 }), null);
  });
});

describe('fixes on the timeline', () => {
  const incident = { number: 3, history: [] };
  const action = {
    _id: 'x1',
    type: 'rollback',
    params: { service: 'checkout' },
    plan: { summary: 'checkout 1.4.2 → 1.4.1 (revision 38 → 37)' },
    status: 'verified',
    proposedBy: 'OpsPilot AI',
    proposedAt: minutes(4),
    decidedBy: 'ana@example.com',
    decidedAt: minutes(5),
    rolledOutAt: minutes(6),
    finishedAt: minutes(9),
  };

  it('shows the proposal, the approval, the rollout and the verdict in order', () => {
    const titles = buildTimeline({ incident, actions: [action] }).map((entry) => entry.title);
    assert.deepEqual(titles, [
      'Proposed: Roll back checkout 1.4.2 → 1.4.1 (revision 38 → 37)',
      'Approved: Roll back checkout 1.4.2 → 1.4.1 (revision 38 → 37)',
      'Rolled back checkout 1.4.2 → 1.4.1 (revision 38 → 37)',
      'Fix verified: the metrics are back within their limits',
    ]);
  });

  it('leaves out proposals that were replaced before anyone decided', () => {
    assert.deepEqual(buildTimeline({ incident, actions: [{ ...action, status: 'superseded' }] }), []);
  });
});
