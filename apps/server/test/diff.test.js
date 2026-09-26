import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  diffDeployments,
  imageVersion,
  netChanges,
  serviceFromPodName,
  snapshotDeployment,
} from '../src/changes/diff.js';

function deployment({ image = 'shop.local/checkout:1.4.1', replicas = 2, env = [], restartedAt, changeCause } = {}) {
  return {
    metadata: {
      name: 'checkout',
      generation: 3,
      annotations: {
        'deployment.kubernetes.io/revision': '4',
        ...(changeCause && { 'kubernetes.io/change-cause': changeCause }),
      },
    },
    spec: {
      replicas,
      template: {
        metadata: { annotations: restartedAt ? { 'kubectl.kubernetes.io/restartedAt': restartedAt } : {} },
        spec: { containers: [{ name: 'checkout', image, env }] },
      },
    },
  };
}

const diff = (before, after) => diffDeployments('checkout', snapshotDeployment(before), snapshotDeployment(after));

describe('deployment diff', () => {
  it('reports an image change as a deploy with both versions', () => {
    const [change] = diff(
      deployment(),
      deployment({ image: 'shop.local/checkout:1.4.2', changeCause: 'release 1.4.2' }),
    );
    assert.equal(change.kind, 'deploy');
    assert.equal(change.summary, 'checkout 1.4.1 → 1.4.2');
    assert.equal(change.details.changeCause, 'release 1.4.2');
  });

  it('reports scaling', () => {
    const [change] = diff(deployment(), deployment({ replicas: 4 }));
    assert.deepEqual([change.kind, change.summary], ['scale', 'checkout scaled from 2 to 4 replicas']);
  });

  it('reports environment changes and masks secret-looking values', () => {
    const before = deployment({
      env: [
        { name: 'API_TOKEN', value: 'abc' },
        { name: 'MODE', value: 'a' },
      ],
    });
    const after = deployment({
      env: [
        { name: 'API_TOKEN', value: 'xyz' },
        { name: 'MODE', value: 'b' },
      ],
    });
    const [change] = diff(before, after);
    assert.equal(change.kind, 'config');
    assert.deepEqual(change.details.env, [{ name: 'MODE', from: 'a', to: 'b' }]);
  });

  it('reports a rolling restart', () => {
    const [change] = diff(deployment(), deployment({ restartedAt: '2026-09-25T12:00:00Z' }));
    assert.equal(change.kind, 'restart');
  });

  it('reports nothing when only status-irrelevant fields differ', () => {
    assert.deepEqual(diff(deployment(), deployment()), []);
  });
});

describe('naming helpers', () => {
  it('reads the version from an image reference', () => {
    assert.equal(imageVersion('shop.local/checkout:1.4.2'), '1.4.2');
    assert.equal(imageVersion('registry:5000/team/app'), 'latest');
    assert.equal(imageVersion('ghcr.io/me/app:2.0.0'), '2.0.0');
  });

  it('recovers the service name from a pod name', () => {
    assert.equal(serviceFromPodName('inventory-7f9bcb4948-llgrz'), 'inventory');
    assert.equal(serviceFromPodName('kube-state-metrics-7fd4c8bfc4-k989b'), 'kube-state-metrics');
    assert.equal(serviceFromPodName('standalone'), 'standalone');
  });
});

describe('net changes', () => {
  let minute = 0;
  const at = () => new Date(Date.UTC(2026, 8, 26, 9, (minute += 1)));
  const deploy = (service, from, to) => ({
    kind: 'deploy',
    service,
    at: at(),
    summary: `${service} ${from} → ${to}`,
    details: { from: `shop.local/${service}:${from}`, to: `shop.local/${service}:${to}` },
  });
  const scale = (service, from, to) => ({
    kind: 'scale',
    service,
    at: at(),
    summary: `${service} scaled from ${from} to ${to} replicas`,
    details: { from, to },
  });

  it('drops a release that was rolled back again', () => {
    assert.deepEqual(netChanges([deploy('checkout', '1.4.1', '1.4.2'), deploy('checkout', '1.4.2', '1.4.1')]), []);
  });

  it('collapses a chain of releases into one', () => {
    const changes = [
      deploy('checkout', '1.4.1', '1.4.2'),
      deploy('checkout', '1.4.2', '1.4.1'),
      deploy('checkout', '1.4.1', '1.4.2'),
    ];
    const [net] = netChanges(changes);
    assert.equal(net.summary, 'checkout 1.4.1 → 1.4.2');
    assert.equal(net.at, changes[2].at);
  });

  it('nets scaling per service and keeps restarts and settings changes', () => {
    const restart = { kind: 'restart', service: 'inventory', at: at(), summary: 'inventory rolling restart' };
    const changes = [scale('payments', 2, 4), restart, scale('payments', 4, 6), scale('checkout', 2, 3)];
    changes.push(scale('checkout', 3, 2));
    assert.deepEqual(
      netChanges(changes).map((change) => change.summary),
      ['inventory rolling restart', 'payments scaled from 2 to 6 replicas'],
    );
  });
});
