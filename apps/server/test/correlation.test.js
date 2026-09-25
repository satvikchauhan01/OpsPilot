import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { findIncidentForAlert, isJoinable } from '../src/incidents/correlation.js';
import { buildGraph } from '../src/topology/graph.js';
import { SHOP_EDGES, alert, minutes } from './fixtures.js';

const graph = buildGraph(SHOP_EDGES);
const WINDOW = { windowMs: 5 * 60_000 };

function incident(id, services, { status = 'open', lastAlertAt = 0, alertsResolvedAt } = {}) {
  return {
    id,
    services,
    status,
    lastAlertAt: minutes(lastAlertAt),
    alertsResolvedAt: alertsResolvedAt === undefined ? undefined : minutes(alertsResolvedAt),
  };
}

describe('alert correlation', () => {
  it('joins an incident that already involves the same service', () => {
    const match = findIncidentForAlert(alert('checkout', 'HighLatency'), [incident('a', ['checkout'])], graph, WINDOW);
    assert.equal(match.id, 'a');
  });

  it('joins an incident on the same call path (S3 arriving gateway first)', () => {
    const open = [incident('a', ['gateway'])];
    assert.equal(findIncidentForAlert(alert('payments', 'HighLatency'), open, graph, WINDOW).id, 'a');
  });

  it('keeps unrelated services apart', () => {
    const open = [incident('a', ['inventory'])];
    assert.equal(findIncidentForAlert(alert('payments', 'HighLatency'), open, graph, WINDOW), null);
  });

  it('prefers the incident that already has the service over a merely related one', () => {
    const open = [incident('newer', ['gateway']), incident('older', ['payments'])];
    assert.equal(findIncidentForAlert(alert('payments', 'HighErrorRate'), open, graph, WINDOW).id, 'older');
  });

  it('never reopens a resolved incident', () => {
    const open = [incident('a', ['checkout'], { status: 'resolved' })];
    assert.equal(findIncidentForAlert(alert('checkout', 'HighErrorRate'), open, graph, WINDOW), null);
  });

  it('falls back to exact service matching when the graph is empty', () => {
    const empty = buildGraph([]);
    const open = [incident('a', ['gateway'])];
    assert.equal(findIncidentForAlert(alert('payments', 'HighLatency'), open, empty, WINDOW), null);
    assert.equal(findIncidentForAlert(alert('gateway', 'HighLatency'), open, empty, WINDOW).id, 'a');
  });
});

describe('joinable incidents', () => {
  it('stays joinable while any alert is firing, however old', () => {
    assert.equal(isJoinable(incident('a', ['x'], { lastAlertAt: 0 }), minutes(90), 5 * 60_000), true);
  });

  it('stays joinable for one window after all alerts resolved', () => {
    const quiet = incident('a', ['x'], { lastAlertAt: 0, alertsResolvedAt: 10 });
    assert.equal(isJoinable(quiet, minutes(14), 5 * 60_000), true);
    assert.equal(isJoinable(quiet, minutes(16), 5 * 60_000), false);
  });
});
