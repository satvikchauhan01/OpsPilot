import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildGraph, blastRadius, onSameCallPath, suspectService } from '../src/topology/graph.js';
import { SHOP_EDGES, alert } from './fixtures.js';

const graph = buildGraph(SHOP_EDGES);

describe('dependency graph', () => {
  it('ignores the virtual user and unknown nodes', () => {
    assert.deepEqual([...graph.services].sort(), ['checkout', 'gateway', 'inventory', 'payments']);
  });

  it('knows which services share a call path', () => {
    assert.equal(onSameCallPath(graph, 'gateway', 'payments'), true);
    assert.equal(onSameCallPath(graph, 'payments', 'checkout'), true);
    assert.equal(onSameCallPath(graph, 'inventory', 'payments'), false);
  });

  it('computes the blast radius as every direct and indirect caller', () => {
    assert.deepEqual(blastRadius(graph, 'payments'), ['checkout', 'gateway']);
    assert.deepEqual(blastRadius(graph, 'inventory'), ['checkout', 'gateway']);
    assert.deepEqual(blastRadius(graph, 'gateway'), []);
  });
});

describe('suspected service', () => {
  it('S1: blames checkout when checkout and gateway fail', () => {
    const alerts = [alert('gateway', 'HighErrorRate', { at: 0 }), alert('checkout', 'HighErrorRate', { at: 1 })];
    assert.equal(suspectService(graph, alerts), 'checkout');
  });

  it('S3: follows the failure down to payments', () => {
    const alerts = [
      alert('gateway', 'HighErrorRate', { at: 0 }),
      alert('checkout', 'HighErrorRate', { at: 0 }),
      alert('payments', 'HighLatency', { at: 1, severity: 'warning' }),
    ];
    assert.equal(suspectService(graph, alerts), 'payments');
  });

  it('S2: a single alerting service is its own suspect', () => {
    assert.equal(suspectService(graph, [alert('inventory', 'MemoryNearLimit', { severity: 'warning' })]), 'inventory');
  });

  it('breaks a tie between equally plausible services by severity', () => {
    const alerts = [
      alert('inventory', 'HighLatency', { at: 0, severity: 'warning' }),
      alert('payments', 'HighErrorRate', { at: 1 }),
      alert('checkout', 'HighErrorRate', { at: 1 }),
    ];
    // inventory and payments both sit under checkout, so neither explains more than the other
    assert.equal(suspectService(graph, alerts), 'payments');
  });

  it('returns null without alerts', () => {
    assert.equal(suspectService(graph, []), null);
  });
});
