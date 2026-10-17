import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { median, summarize } from '../src/insights/stats.js';

const MINUTE = 60_000;
const since = new Date('2026-10-01T00:00:00Z');
const until = new Date('2026-10-03T12:00:00Z');
const at = (minutes) => new Date(new Date('2026-10-02T10:00:00Z').getTime() + minutes * MINUTE);

function incident(id, overrides = {}) {
  return {
    _id: id,
    number: Number(id.slice(1)),
    title: `incident ${id}`,
    severity: 'critical',
    status: 'resolved',
    suspectedService: 'checkout',
    startedAt: at(0),
    resolvedAt: at(10),
    ...overrides,
  };
}

const empty = { investigations: [], actions: [], postmortems: [], usage: [], since, until };

describe('median', () => {
  it('takes the middle value, or the mean of the two middle ones', () => {
    assert.equal(median([5, 1, 3]), 3);
    assert.equal(median([4, 1, 3, 2]), 2.5);
  });

  it('ignores missing values and has none for an empty list', () => {
    assert.equal(median([null, 2, undefined]), 2);
    assert.equal(median([]), null);
  });
});

describe('incident insights', () => {
  it('times each step from the start of the incident', () => {
    const result = summarize({
      ...empty,
      incidents: [incident('i1')],
      investigations: [
        { incident: 'i1', status: 'completed', startedAt: at(1), finishedAt: at(3), usage: { requests: 4 } },
        { incident: 'i1', status: 'completed', startedAt: at(6), finishedAt: at(7), usage: { requests: 2 } },
      ],
      actions: [{ incident: 'i1', status: 'verified', type: 'rollback', finishedAt: at(8) }],
    });

    // the first finished investigation counts, not the later one
    assert.equal(result.timing.toRootCause.median, 3 * MINUTE);
    assert.equal(result.timing.toFix.median, 8 * MINUTE);
    assert.equal(result.timing.toResolve.median, 10 * MINUTE);
  });

  it('leaves open incidents out of the time to resolve', () => {
    const result = summarize({
      ...empty,
      incidents: [incident('i1'), incident('i2', { status: 'open', resolvedAt: undefined })],
    });
    assert.deepEqual(result.timing.toResolve, { median: 10 * MINUTE, count: 1 });
    assert.equal(result.totals.open, 1);
  });

  it('takes the cause from the latest finished investigation', () => {
    const hypotheses = (causeType) => ({ hypotheses: [{ causeType, confidence: 0.8 }] });
    const result = summarize({
      ...empty,
      incidents: [incident('i1'), incident('i2')],
      investigations: [
        {
          incident: 'i1',
          status: 'completed',
          startedAt: at(1),
          finishedAt: at(2),
          result: hypotheses('slow_dependency'),
        },
        { incident: 'i1', status: 'completed', startedAt: at(4), finishedAt: at(5), result: hypotheses('bad_deploy') },
      ],
    });
    assert.deepEqual(
      result.byCause.map(({ name, incidents }) => [name, incidents]),
      [
        ['bad_deploy', 1],
        ['not_investigated', 1],
      ],
    );
  });

  it('counts every day of the window, quiet ones included', () => {
    const result = summarize({ ...empty, incidents: [incident('i1'), incident('i2', { severity: 'warning' })] });
    assert.deepEqual(result.perDay, [
      { day: '2026-10-01', critical: 0, warning: 0 },
      { day: '2026-10-02', critical: 1, warning: 1 },
      { day: '2026-10-03', critical: 0, warning: 0 },
    ]);
  });

  it('rates fixes on the ones that ran, and follows the AI proposals', () => {
    const result = summarize({
      ...empty,
      incidents: [incident('i1')],
      actions: [
        { incident: 'i1', status: 'verified', type: 'rollback', source: { kind: 'investigation' } },
        { incident: 'i1', status: 'failed', type: 'scale', source: { kind: 'investigation' } },
        { incident: 'i1', status: 'rejected', type: 'restart', source: { kind: 'investigation' } },
        { incident: 'i1', status: 'verified', type: 'rollback', source: { kind: 'responder' } },
        { incident: 'i1', status: 'superseded', type: 'restart', source: { kind: 'investigation' } },
      ],
    });

    assert.equal(result.fixes.successRate, 2 / 3);
    assert.deepEqual(result.fixes.byType.rollback, { verified: 2, failed: 0, rejected: 0 });
    assert.deepEqual(result.ai.fixes, { proposed: 4, approved: 2, rejected: 1, verified: 1, failed: 1 });
  });
});
