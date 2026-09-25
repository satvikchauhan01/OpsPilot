import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildTimeline } from '../src/incidents/timeline.js';
import { canTransition } from '../src/incidents/status.js';
import { minutes } from './fixtures.js';

const incident = {
  number: 7,
  history: [
    { at: minutes(2), type: 'opened', by: 'system' },
    { at: minutes(2), type: 'alert', by: 'system' },
    { at: minutes(9), type: 'status', from: 'open', to: 'resolved', by: 'ana@example.com' },
  ],
};

const alerts = [
  {
    id: 'a1',
    name: 'HighErrorRate',
    service: 'checkout',
    severity: 'critical',
    status: 'resolved',
    startsAt: minutes(2),
    endsAt: minutes(8),
  },
];

const changes = [
  { id: 'c1', kind: 'deploy', service: 'checkout', summary: 'checkout 1.4.1 → 1.4.2', at: minutes(1), details: {} },
  {
    id: 'c2',
    kind: 'pod_restart',
    service: 'inventory',
    summary: 'inventory-x restarted',
    at: minutes(2),
    details: { reason: 'OOMKilled' },
  },
];

describe('incident timeline', () => {
  const timeline = buildTimeline({ incident, alerts, changes });

  it('lists every source in time order', () => {
    assert.deepEqual(
      timeline.map((entry) => entry.title),
      [
        'checkout 1.4.1 → 1.4.2',
        'inventory-x restarted',
        'HighErrorRate firing on checkout',
        'INC-7 opened',
        'HighErrorRate resolved on checkout',
        'Status changed from open to resolved',
      ],
    );
  });

  it('puts likely causes before effects when timestamps tie', () => {
    const atTwo = timeline.filter((entry) => entry.at.getTime() === minutes(2).getTime()).map((entry) => entry.kind);
    assert.deepEqual(atTwo, ['k8s', 'alert', 'incident']);
  });

  it('does not repeat alerts that are also in the incident history', () => {
    assert.equal(timeline.filter((entry) => entry.kind === 'alert').length, 2);
  });

  it('marks OOM kills as critical', () => {
    assert.equal(timeline.find((entry) => entry.id === 'change-c2').tone, 'critical');
  });

  it('folds repeated warnings on the same service into one entry', () => {
    const probe = (id, at, service = 'checkout') => ({
      id,
      kind: 'warning',
      service,
      summary: 'Unhealthy: Readiness probe failed',
      at: minutes(at),
      occurrences: 2,
      details: { reason: 'Unhealthy' },
    });
    const folded = buildTimeline({
      incident: { number: 1, history: [] },
      changes: [probe('w1', 0), probe('w2', 1), probe('w3', 2), probe('w4', 9), probe('w5', 1, 'payments')],
    });

    assert.deepEqual(
      folded.map((entry) => [entry.service, entry.count]),
      [
        ['checkout', 6],
        ['payments', 2],
        ['checkout', 2],
      ],
    );
  });
});

describe('incident status transitions', () => {
  it('allows moving forward and resolving', () => {
    assert.equal(canTransition('open', 'investigating'), true);
    assert.equal(canTransition('investigating', 'mitigating'), true);
    assert.equal(canTransition('mitigating', 'resolved'), true);
  });

  it('keeps resolved incidents closed', () => {
    assert.equal(canTransition('resolved', 'open'), false);
    assert.equal(canTransition('resolved', 'investigating'), false);
  });

  it('rejects going back to open', () => {
    assert.equal(canTransition('investigating', 'open'), false);
  });
});
