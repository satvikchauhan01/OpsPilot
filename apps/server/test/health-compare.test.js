import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { compare } from '../src/investigation/health.js';

describe('service health comparison', () => {
  it('describes a memory climb in percentage points and flags it', () => {
    assert.deepEqual(compare('memory', { before: 0.12, now: 0.86 }), {
      text: 'memory of limit 12% → 86% (+74.0 pts)',
      notable: true,
    });
  });

  it('describes request rates relatively and leaves small moves unflagged', () => {
    assert.deepEqual(compare('rps', { before: 8.01, now: 8.03 }), {
      text: 'requests 8.0/s → 8.0/s (0%)',
      notable: false,
    });
    assert.equal(compare('memory', { before: 0.85, now: 0.12 }).text, 'memory of limit 85% → 12% (-73.0 pts)');
    assert.equal(compare('rps', { before: 8, now: 50 }).text, 'requests 8.0/s → 50.0/s (+525%)');
  });

  it('handles metrics that only exist on one side', () => {
    assert.equal(compare('saturation', { before: undefined, now: 0.95 }).text, 'processor connections busy 95% (new)');
    assert.equal(compare('rps', { before: 0, now: 3 }).text, 'requests 0.0/s → 3.0/s (up from zero)');
  });
});
