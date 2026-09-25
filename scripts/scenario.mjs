// Breaks the demo shop in one of four reproducible ways (REQUIREMENTS.md, DS-5).
//
//   npm run scenario -- <name>     start a scenario
//   npm run scenario -- reset      undo everything
//   npm run scenario -- status     show what is currently injected

import { step } from './lib/shell.mjs';
import { LOCAL_OVERLAY, kubectl, runningPods, requestInPod } from './lib/kube.mjs';

const SHOP_SERVICES = ['gateway', 'checkout', 'payments', 'inventory'];

const SCENARIOS = {
  'bad-deploy': {
    id: 'S1',
    summary: 'ship checkout 1.4.2, a release that crashes on expired coupon codes',
    run() {
      // Image and change-cause go in one patch. Annotating separately would stamp the
      // reason onto whichever revision happens to be current at that moment.
      const release = {
        metadata: { annotations: { 'kubernetes.io/change-cause': 'release 1.4.2' } },
        spec: { template: { spec: { containers: [{ name: 'checkout', image: 'shop.local/checkout:1.4.2' }] } } },
      };
      kubectl(['-n', 'shop', 'patch', 'deployment/checkout', '--patch', JSON.stringify(release)]);
    },
  },
  'memory-leak': {
    id: 'S2',
    summary: 'make inventory leak memory until it nears its limit',
    run: () => injectFault('inventory', { leakMbPerMin: 300 }),
  },
  'payments-latency': {
    id: 'S3',
    summary: 'make payments hang on card-processor calls',
    run: () => injectFault('payments', { latencyMs: 2500 }),
  },
  'traffic-spike': {
    id: 'S4',
    summary: 'flash-sale traffic that saturates the payments worker pool',
    run: () => console.log(loadgenRequest('POST', { rps: 50, checkoutShare: 0.8 })),
  },
  reset: {
    summary: 'undo every scenario and return to the baseline',
    run: reset,
  },
  status: {
    summary: 'show deployed versions and injected faults',
    run: status,
  },
};

const name = process.argv[2];
const scenario = SCENARIOS[name];

if (!scenario) {
  if (name && name !== 'list') console.error(`Unknown scenario "${name}".\n`);
  console.log('Usage: npm run scenario -- <name>\n');
  for (const [key, { id = '', summary }] of Object.entries(SCENARIOS)) {
    console.log(`  ${key.padEnd(18)} ${id.padEnd(3)} ${summary}`);
  }
  process.exit(name && name !== 'list' ? 1 : 0);
}

try {
  scenario.run();
} catch (err) {
  console.error(`\n${err.message}`);
  process.exit(1);
}

function injectFault(service, faults) {
  const pods = runningPods('shop', service);
  if (pods.length === 0) throw new Error(`no running ${service} pods found`);

  for (const pod of pods) {
    console.log(`${pod}: ${requestInPod('shop', pod, 'POST', '/_chaos', faults)}`);
  }
}

function loadgenRequest(method, body) {
  const [pod] = runningPods('loadgen', 'loadgen');
  if (!pod) throw new Error('the load generator is not running');
  return requestInPod('loadgen', pod, method, '/control', body);
}

function reset() {
  // Clear runtime faults first: re-applying the manifests may replace some of these pods.
  step('Clearing injected faults');
  const leaked = new Set();
  for (const service of SHOP_SERVICES) {
    for (const pod of runningPods('shop', service)) {
      try {
        const cleared = JSON.parse(requestInPod('shop', pod, 'DELETE', '/_chaos'));
        if (cleared.leakedMb > 0) leaked.add(service);
      } catch (err) {
        console.warn(`  skipped ${pod}: ${err.message.split('\n')[0]}`);
      }
    }
  }
  loadgenRequest('DELETE');

  step('Restoring the baseline versions and replica counts');
  kubectl(['apply', '-k', LOCAL_OVERLAY]);

  // V8 hangs on to freed heap pages, so a pod that leaked stays close to its memory limit
  // long after the leak stops. A restart is the only dependable way back to baseline,
  // which is also the fix the memory-leak scenario expects.
  for (const service of leaked) {
    kubectl(['-n', 'shop', 'rollout', 'restart', `deployment/${service}`]);
  }

  for (const service of SHOP_SERVICES) {
    kubectl(['-n', 'shop', 'rollout', 'status', `deployment/${service}`, '--timeout=180s']);
  }
}

function status() {
  kubectl([
    '-n',
    'shop',
    'get',
    'deployments',
    '-o',
    'custom-columns=SERVICE:.metadata.name,IMAGE:.spec.template.spec.containers[0].image,READY:.status.readyReplicas,WANTED:.spec.replicas',
  ]);

  console.log('\nInjected faults:');
  for (const service of SHOP_SERVICES) {
    for (const pod of runningPods('shop', service)) {
      console.log(`  ${pod.padEnd(34)} ${requestInPod('shop', pod, 'GET', '/_chaos')}`);
    }
  }

  const { profile, surgeEndsAt } = JSON.parse(loadgenRequest('GET'));
  const share = Math.round(profile.checkoutShare * 100);
  const until = surgeEndsAt ? `surge until ${surgeEndsAt}` : 'baseline';
  console.log(`\nTraffic: ${profile.rps} rps, ${share}% checkouts (${until})`);
}
