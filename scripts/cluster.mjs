// Local Kubernetes environment: a minikube profile running the demo shop and the
// observability stack.
//
//   npm run cluster:up      create or start the cluster, build images, deploy everything
//   npm run cluster:stop    stop the cluster but keep it (frees CPU and memory)
//   npm run cluster:down    delete the cluster
//   npm run cluster:status  show what is running

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { run, output, isInstalled, step } from './lib/shell.mjs';
import { PROFILE, ROOT, LOCAL_OVERLAY, kubectl, kubectlOutput } from './lib/kube.mjs';

const DEMO_DIR = path.join(ROOT, 'demo');
const NAMESPACES = ['observability', 'shop', 'loadgen'];

// NodePorts published on localhost. The host ports sit in their own block so they don't
// clash with the usual 3000/8080/9090 dev servers.
const ENDPOINTS = [
  { name: 'Shop gateway', hostPort: 18080, nodePort: 30080, path: '/api/products' },
  { name: 'Grafana', hostPort: 13000, nodePort: 30300 },
  { name: 'Prometheus', hostPort: 19090, nodePort: 30090 },
  { name: 'Alertmanager', hostPort: 19093, nodePort: 30093 },
  { name: 'Loki', hostPort: 13100, nodePort: 30100, path: '/ready' },
  { name: 'Tempo', hostPort: 13200, nodePort: 30200, path: '/ready' },
];

const commands = { up, stop, down, status };
const command = commands[process.argv[2]];

if (!command) {
  console.error(`usage: node scripts/cluster.mjs <${Object.keys(commands).join('|')}>`);
  process.exit(1);
}

try {
  command();
} catch (err) {
  console.error(`\n${err.message}`);
  process.exit(1);
}

function up() {
  for (const tool of ['docker', 'minikube', 'kubectl']) {
    if (!isInstalled(tool)) throw new Error(`${tool} is required but was not found on PATH`);
  }

  const state = clusterState();
  if (state === 'missing') {
    createCluster();
  } else if (state !== 'running') {
    step(`Starting minikube cluster "${PROFILE}"`);
    run('minikube', ['start', '-p', PROFILE]);
  }

  const rebuilt = buildImages();

  step('Deploying the shop and the observability stack');
  kubectl(['apply', '-k', LOCAL_OVERLAY]);
  restartDeploymentsUsing(rebuilt);

  step('Waiting for every deployment to become available');
  for (const namespace of NAMESPACES) {
    kubectl(['wait', '--for=condition=Available', 'deployment', '--all', '-n', namespace, '--timeout=300s']);
  }

  printEndpoints();
}

function stop() {
  if (clusterState() === 'missing') return console.log(`There is no "${PROFILE}" cluster.`);
  step(`Stopping minikube cluster "${PROFILE}"`);
  run('minikube', ['stop', '-p', PROFILE]);
}

function down() {
  if (clusterState() === 'missing') return console.log(`There is no "${PROFILE}" cluster.`);
  step(`Deleting minikube cluster "${PROFILE}"`);
  run('minikube', ['delete', '-p', PROFILE]);
}

function status() {
  const state = clusterState();
  console.log(`Cluster "${PROFILE}": ${state}`);
  if (state !== 'running') return;

  for (const namespace of NAMESPACES) {
    console.log(`\n[${namespace}]`);
    kubectl(['get', 'deployments', '-n', namespace, '-o', 'wide']);
  }
  printEndpoints();
}

function clusterState() {
  const { valid = [] } = JSON.parse(output('minikube', ['profile', 'list', '-o', 'json']) || '{}');
  const profile = valid.find((p) => p.Name === PROFILE);
  if (!profile) return 'missing';
  return profile.Status === 'OK' || profile.Status === 'Running' ? 'running' : profile.Status.toLowerCase();
}

function createCluster() {
  step(`Creating minikube cluster "${PROFILE}"`);
  const ports = ENDPOINTS.map(({ hostPort, nodePort }) => `127.0.0.1:${hostPort}:${nodePort}`);
  run('minikube', [
    'start',
    '-p', PROFILE,
    '--driver=docker',
    '--cpus=4',
    '--memory=6g',
    `--ports=${ports.join(',')}`,
  ]);
}

// Images are built straight into the cluster's own Docker daemon, so nothing needs to be
// pushed to a registry or loaded afterwards. Returns the images whose content changed.
function buildImages() {
  const env = { ...process.env, ...minikubeDockerEnv() };
  const releases = JSON.parse(readFileSync(path.join(DEMO_DIR, 'releases.json'), 'utf8'));
  const rebuilt = [];

  for (const [service, versions] of Object.entries(releases)) {
    for (const { version, defect = '' } of versions) {
      const image = `shop.local/${service}:${version}`;
      const previousId = imageId(image, env);

      step(`Building ${image}`);
      run('docker', [
        'build', '--quiet',
        '--build-arg', `SERVICE=${service}`,
        '--build-arg', `APP_VERSION=${version}`,
        '--build-arg', `RELEASE_DEFECT=${defect}`,
        '-t', image,
        DEMO_DIR,
      ], { env });

      if (previousId && imageId(image, env) !== previousId) rebuilt.push(image);
    }
  }
  return rebuilt;
}

function imageId(image, env) {
  try {
    return output('docker', ['image', 'inspect', '--format', '{{.Id}}', image], { env });
  } catch {
    return null;
  }
}

// Demo code changes don't bump the image tag, so Kubernetes wouldn't notice them on its
// own. Roll the deployments that run an image we just rebuilt.
function restartDeploymentsUsing(images) {
  if (images.length === 0) return;

  for (const namespace of ['shop', 'loadgen']) {
    const rows = kubectlOutput([
      '-n', namespace, 'get', 'deployments',
      '-o', 'jsonpath={range .items[*]}{.metadata.name}={.spec.template.spec.containers[0].image}{"\\n"}{end}',
    ]);
    for (const row of rows.split('\n').filter(Boolean)) {
      const [name, image] = row.split('=');
      if (images.includes(image)) kubectl(['-n', namespace, 'rollout', 'restart', `deployment/${name}`]);
    }
  }
}

function minikubeDockerEnv() {
  const lines = output('minikube', ['-p', PROFILE, 'docker-env', '--shell', 'none']).split(/\r?\n/);
  const pairs = lines
    .filter((line) => line.startsWith('DOCKER_'))
    .map((line) => [line.slice(0, line.indexOf('=')), line.slice(line.indexOf('=') + 1)]);
  return Object.fromEntries(pairs);
}

function printEndpoints() {
  console.log('\nOpsPilot demo environment:\n');
  for (const { name, hostPort, path: urlPath = '' } of ENDPOINTS) {
    console.log(`  ${name.padEnd(14)} http://localhost:${hostPort}${urlPath}`);
  }
  console.log('\nBreak something with: npm run scenario -- list');
}
