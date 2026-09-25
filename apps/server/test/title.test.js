import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { incidentTitle } from '../src/incidents/title.js';
import { alert } from './fixtures.js';

describe('incident titles', () => {
  it('names the alert and the service for a single alert', () => {
    assert.equal(incidentTitle([alert('inventory', 'MemoryNearLimit')], 'inventory'), 'MemoryNearLimit on inventory');
  });

  it('leads with the suspected origin and lists who else is affected', () => {
    const alerts = [
      alert('gateway', 'HighErrorRate', { at: 0 }),
      alert('checkout', 'HighErrorRate', { at: 0 }),
      alert('payments', 'HighLatency', { at: 1, severity: 'warning' }),
    ];
    assert.equal(incidentTitle(alerts, 'payments'), 'HighLatency on payments, affecting checkout and gateway');
  });

  it('puts the most severe alert first and shortens long lists', () => {
    const alerts = [
      alert('payments', 'HighLatency', { severity: 'warning' }),
      alert('payments', 'WorkerPoolSaturated', { severity: 'warning' }),
      alert('payments', 'HighErrorRate', { severity: 'critical' }),
    ];
    assert.equal(incidentTitle(alerts, 'payments'), 'HighErrorRate, HighLatency and more on payments');
  });
});
