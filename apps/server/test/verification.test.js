import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { describeBreach, judge } from '../src/remediation/verification.js';
import { minutes } from './fixtures.js';

const healthy = { errorRatio: 0.004, p95: 0.21, memory: 0.31, saturation: null };
const sample = (at, values) => ({ at: minutes(at), values });

describe('fix verification', () => {
  const judgeFrom = minutes(2);

  it('verifies when every judged sample is inside every limit', () => {
    const samples = [
      sample(1, { checkout: { ...healthy, errorRatio: 0.3 } }), // still recovering, before the judged part
      sample(2, { checkout: healthy, gateway: healthy }),
      sample(3, { checkout: healthy, gateway: healthy }),
    ];
    assert.deepEqual(judge(samples, { judgeFrom }), { outcome: 'verified', breaches: [] });
  });

  it('fails on any breach in the judged part, reporting the worst value', () => {
    const samples = [
      sample(2, { payments: { ...healthy, p95: 1.4 } }),
      sample(2.5, { payments: { ...healthy, p95: 2.1 } }),
      sample(3, { payments: healthy, checkout: { ...healthy, errorRatio: 0.12 } }),
    ];
    const verdict = judge(samples, { judgeFrom });
    assert.equal(verdict.outcome, 'failed');
    assert.deepEqual(verdict.breaches, [
      { service: 'payments', metric: 'p95', value: 2.1, max: 1 },
      { service: 'checkout', metric: 'errorRatio', value: 0.12, max: 0.05 },
    ]);
    assert.equal(verdict.reason, 'payments p95 latency 2.10 s (limit 1.00 s); checkout error rate 12% (limit 5%)');
  });

  it("doesn't count missing values against the fix", () => {
    const samples = [sample(3, { inventory: { errorRatio: null, p95: undefined, memory: 0.26 } })];
    assert.equal(judge(samples, { judgeFrom }).outcome, 'verified');
  });

  it('cannot verify anything without judged samples', () => {
    const verdict = judge([sample(1, { checkout: healthy })], { judgeFrom });
    assert.equal(verdict.outcome, 'failed');
    assert.match(verdict.reason, /no measurements/);
  });

  it('words breaches with their unit', () => {
    assert.equal(
      describeBreach({ service: 'payments', metric: 'saturation', value: 0.97, max: 0.9 }),
      'payments processor connections busy 97% (limit 90%)',
    );
  });
});
