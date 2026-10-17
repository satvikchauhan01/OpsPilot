// The public deployment: a single-node k3s cluster on a free VM (docs/DEPLOYMENT.md), driven
// from this machine over SSH.
//
//   npm run cloud -- setup    install Docker and k3s on the VM (once)
//   npm run cloud -- deploy   copy the repository over, build the images there, deploy it all
//   npm run cloud -- status   show what runs on the VM and whether the site answers
//
// Settings come from .env.cloud (gitignored, see .env.cloud.example).

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { run, output, step } from './lib/shell.mjs';
import { ROOT } from './lib/kube.mjs';
import { ensureGeneratedSecrets } from './lib/env.mjs';

const SETTINGS_FILE = path.join(ROOT, '.env.cloud');
const REMOTE_DIR = 'opspilot';
const OVERLAY = 'deploy/k8s/overlays/cloud';
const NAMESPACES = ['shop', 'loadgen', 'observability', 'opspilot'];
const REQUIRED = ['CLOUD_SSH', 'DOMAIN', 'MONGODB_URI', 'ADMIN_EMAIL', 'ADMIN_PASSWORD', 'GEMINI_API_KEY'];
// Copied from .env.cloud into the server's Secret
const SERVER_SECRETS = [
  'MONGODB_URI',
  'MONGODB_DB',
  'GEMINI_API_KEY',
  'GEMINI_RELAY_URL',
  'GEMINI_RELAY_TOKEN',
  'ADMIN_EMAIL',
  'ADMIN_PASSWORD',
  'ADMIN_NAME',
  'SESSION_SECRET',
  'ALERTMANAGER_WEBHOOK_TOKEN',
];

const commands = { setup, deploy, status };
const command = commands[process.argv[2]];

if (!command) {
  console.error(`usage: node scripts/cloud.mjs <${Object.keys(commands).join('|')}>`);
  process.exit(1);
}

try {
  await command(loadSettings());
} catch (err) {
  console.error(`\n${err.message}`);
  process.exit(1);
}

function loadSettings() {
  if (!existsSync(SETTINGS_FILE)) {
    throw new Error('.env.cloud is missing: copy .env.cloud.example to .env.cloud and fill it in');
  }
  const { settings, added } = ensureGeneratedSecrets(SETTINGS_FILE);
  if (added.length > 0) console.log(`Generated ${added.join(' and ')} in .env.cloud`);

  const missing = REQUIRED.filter((name) => !settings[name]);
  if (missing.length > 0) throw new Error(`.env.cloud needs ${missing.join(', ')}`);
  if (!/^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$/i.test(settings.DOMAIN)) {
    throw new Error(`DOMAIN should be a plain host name like opspilot.duckdns.org, not "${settings.DOMAIN}"`);
  }
  return settings;
}

// BatchMode makes a missing key fail at once instead of waiting for a password prompt.
function sshArgs(settings) {
  const key = settings.CLOUD_SSH_KEY ? ['-i', settings.CLOUD_SSH_KEY] : [];
  const port = settings.CLOUD_SSH_PORT ? ['-p', settings.CLOUD_SSH_PORT] : [];
  return ['-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=accept-new', ...key, ...port, settings.CLOUD_SSH];
}

function remote(settings, commandLine, options) {
  run('ssh', [...sshArgs(settings), commandLine], options);
}

// Longer scripts go to bash over stdin, which spares them a round of shell quoting.
function remoteScript(settings, lines, { capture = false } = {}) {
  const input = ['set -euo pipefail', ...lines].join('\n');
  const args = [...sshArgs(settings), 'bash -s'];
  return capture ? output('ssh', args, { input }) : run('ssh', args, { input });
}

// Docker builds the images and k3s runs them. Both come from their official install scripts.
function setup(settings) {
  step(`Installing Docker and k3s on ${settings.CLOUD_SSH}`);
  remoteScript(settings, [
    'command -v docker >/dev/null || curl -fsSL https://get.docker.com | sudo sh',
    'command -v k3s >/dev/null || curl -sfL https://get.k3s.io | sudo sh -s - --write-kubeconfig-mode 600',
    'sudo k3s kubectl get nodes',
  ]);
  console.log('\nThe VM is ready. Next: npm run cloud -- deploy');
}

async function deploy(settings) {
  const tag = imageTag();

  step(`Copying the repository to ${settings.CLOUD_SSH}:~/${REMOTE_DIR}`);
  copyRepository(settings);

  step('Building the images on the VM and handing them to k3s');
  const changedShopImages = buildImages(settings, tag);

  step('Storing the secrets in the cluster');
  applySecrets(settings);

  step(`Deploying (image tag ${tag})`);
  remote(settings, `cat > ${REMOTE_DIR}/${OVERLAY}/deploy.env`, {
    input: `DOMAIN=${settings.DOMAIN}\nIMAGE_TAG=${tag}\n`,
  });
  remote(settings, `sudo k3s kubectl apply -k ${REMOTE_DIR}/${OVERLAY}`);
  restartShopDeployments(settings, changedShopImages);

  step('Waiting for every deployment to roll out');
  remoteScript(settings, [
    `for namespace in ${NAMESPACES.join(' ')}; do`,
    '  for deployment in $(sudo k3s kubectl -n $namespace get deployments -o name); do',
    '    sudo k3s kubectl -n $namespace rollout status $deployment --timeout=300s',
    '  done',
    'done',
  ]);
  removeOldImages(settings, tag);

  step(`Waiting for https://${settings.DOMAIN} (the first certificate takes a minute)`);
  if (await waitForSite(settings.DOMAIN)) {
    console.log(`\nOpsPilot is live at https://${settings.DOMAIN}`);
  } else {
    console.log(`\nThe cluster is up, but https://${settings.DOMAIN} doesn't answer yet. See docs/DEPLOYMENT.md.`);
  }
}

// A new tag per deploy, so applying the manifests rolls the pods on its own
function imageTag() {
  const commit = output('git', ['rev-parse', '--short', 'HEAD'], { cwd: ROOT });
  const stamp = new Date().toISOString().replace(/[-:]/g, '').slice(0, 13);
  return `${stamp}-${commit}`;
}

// Everything git knows about, committed or not, minus what .gitignore leaves out (.env files,
// node_modules, build output), in one tar stream over SSH.
function copyRepository(settings) {
  const files = output('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], { cwd: ROOT })
    .split('\0')
    .filter((file) => file && existsSync(path.join(ROOT, file)));

  // tar reads the file list from stdin and writes the archive to stdout
  const archive = spawnSync('tar', ['-cf', '-', '-T', '-'], {
    cwd: ROOT,
    input: files.join('\n'),
    maxBuffer: 512 * 1024 * 1024,
  });
  if (archive.error) throw archive.error;
  if (archive.status !== 0) throw new Error(`tar failed: ${archive.stderr.toString().trim()}`);

  remote(
    settings,
    `rm -rf ${REMOTE_DIR}.new && mkdir ${REMOTE_DIR}.new && tar -xf - -C ${REMOTE_DIR}.new && rm -rf ${REMOTE_DIR} && mv ${REMOTE_DIR}.new ${REMOTE_DIR}`,
    { input: archive.stdout },
  );
  console.log(`${files.length} files`);
}

// Builds on the VM itself, so the images match its CPU (the free Oracle VMs are ARM), then
// imports them into k3s's containerd. Returns the shop images whose content changed, since
// those keep their version tags.
function buildImages(settings, tag) {
  const releases = JSON.parse(readFileSync(path.join(ROOT, 'demo', 'releases.json'), 'utf8'));
  const shop = Object.entries(releases).flatMap(([service, versions]) =>
    versions.map(({ version, defect = '' }) => ({
      image: `shop.local/${service}:${version}`,
      service,
      version,
      defect,
    })),
  );
  const opspilot = [`opspilot/server:${tag}`, `opspilot/web:${tag}`];

  const changed = remoteScript(
    settings,
    [
      `cd ${REMOTE_DIR}`,
      'id_of() { sudo docker image inspect --format "{{.Id}}" "$1" 2>/dev/null || true; }',
      // Without provenance: its build timestamps would give an unchanged image a new ID
      ...shop.flatMap(({ image, service, version, defect }) => [
        `before=$(id_of ${image})`,
        `sudo docker build --quiet --provenance=false --build-arg SERVICE=${service} --build-arg APP_VERSION=${version} --build-arg RELEASE_DEFECT=${defect} -t ${image} demo >/dev/null`,
        `if [ -n "$before" ] && [ "$before" != "$(id_of ${image})" ]; then echo "changed ${image}"; fi`,
      ]),
      `sudo docker build --quiet -f apps/server/Dockerfile -t ${opspilot[0]} . >/dev/null`,
      `sudo docker build --quiet -f apps/web/Dockerfile -t ${opspilot[1]} . >/dev/null`,
      `sudo docker save ${[...shop.map(({ image }) => image), ...opspilot].join(' ')} | sudo k3s ctr images import - >/dev/null`,
      `sudo docker image rm ${opspilot.join(' ')} >/dev/null`,
    ],
    { capture: true },
  )
    .split('\n')
    .filter((line) => line.startsWith('changed '))
    .map((line) => line.slice('changed '.length));

  console.log(`${shop.length + opspilot.length} images${changed.length > 0 ? `, changed: ${changed.join(', ')}` : ''}`);
  return changed;
}

// The server's settings, and where Alertmanager sends alerts. Both go over stdin, so no
// secret ever shows up in a command line.
function applySecrets(settings) {
  const server = Object.fromEntries(
    SERVER_SECRETS.filter((name) => settings[name]).map((name) => [name, settings[name]]),
  );
  const manifests = {
    apiVersion: 'v1',
    kind: 'List',
    items: [
      { apiVersion: 'v1', kind: 'Namespace', metadata: { name: 'opspilot' } },
      { apiVersion: 'v1', kind: 'Namespace', metadata: { name: 'observability' } },
      {
        apiVersion: 'v1',
        kind: 'Secret',
        metadata: { name: 'opspilot-server', namespace: 'opspilot' },
        type: 'Opaque',
        stringData: server,
      },
      {
        apiVersion: 'v1',
        kind: 'Secret',
        metadata: { name: 'alertmanager-opspilot', namespace: 'observability' },
        type: 'Opaque',
        stringData: {
          url: 'http://opspilot-server.opspilot:4000/api/webhooks/alertmanager',
          token: settings.ALERTMANAGER_WEBHOOK_TOKEN,
        },
      },
    ],
  };
  remote(settings, 'sudo k3s kubectl apply -f -', { input: JSON.stringify(manifests) });
}

// Demo code changes don't bump the shop's image tags, so Kubernetes wouldn't notice them.
function restartShopDeployments(settings, images) {
  if (images.length === 0) return;
  for (const namespace of ['shop', 'loadgen']) {
    const rows = remoteScript(
      settings,
      [
        `sudo k3s kubectl -n ${namespace} get deployments -o jsonpath='{range .items[*]}{.metadata.name}={.spec.template.spec.containers[0].image}{"\\n"}{end}'`,
      ],
      { capture: true },
    );
    for (const row of rows.split('\n').filter(Boolean)) {
      const [name, image] = row.split('=');
      if (images.includes(image))
        remote(settings, `sudo k3s kubectl -n ${namespace} rollout restart deployment/${name}`);
    }
  }
}

// Every deploy leaves its OpsPilot images behind in containerd; only the running tag stays.
// The shop's images all stay, since the demo scenarios switch between them.
function removeOldImages(settings, tag) {
  remoteScript(settings, [
    `old=$(sudo k3s ctr images ls -q | grep -E '^docker.io/opspilot/(server|web):' | grep -v ':${tag}$' || true)`,
    'if [ -n "$old" ]; then sudo k3s ctr images rm $old >/dev/null; fi',
  ]);
}

async function waitForSite(domain, timeoutMs = 4 * 60_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`https://${domain}/api/health`, { signal: AbortSignal.timeout(10_000) });
      if (res.ok) return true;
    } catch {
      // not reachable yet, or still on Traefik's default certificate
    }
    await new Promise((resolve) => setTimeout(resolve, 10_000));
  }
  return false;
}

async function status(settings) {
  step(`Pods on ${settings.CLOUD_SSH}`);
  remote(settings, 'sudo k3s kubectl get pods -A -o wide');
  step(`https://${settings.DOMAIN}/api/health`);
  try {
    const res = await fetch(`https://${settings.DOMAIN}/api/health`, { signal: AbortSignal.timeout(10_000) });
    console.log(res.status, await res.text());
  } catch (err) {
    console.log(`not reachable: ${err.cause?.message ?? err.message}`);
  }
}
