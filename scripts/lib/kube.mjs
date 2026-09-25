import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { run, output } from './shell.mjs';

// minikube names the kubectl context after the profile. Every call pins that context, so
// these scripts never touch whichever other cluster happens to be the current one.
export const PROFILE = 'opspilot';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const LOCAL_OVERLAY = path.join(ROOT, 'deploy', 'k8s', 'overlays', 'local');

export function kubectl(args, options) {
  run('kubectl', ['--context', PROFILE, ...args], options);
}

export function kubectlOutput(args) {
  return output('kubectl', ['--context', PROFILE, ...args]);
}

export function runningPods(namespace, app) {
  const names = kubectlOutput([
    '-n',
    namespace,
    'get',
    'pods',
    '-l',
    `app.kubernetes.io/name=${app}`,
    '--field-selector=status.phase=Running',
    '-o',
    'jsonpath={.items[*].metadata.name}',
  ]);
  return names.split(/\s+/).filter(Boolean);
}

// Sends an HTTP request from inside a pod to its own port. The call lands on exactly that
// process, and nothing has to be exposed outside the cluster to make it.
export function requestInPod(namespace, pod, method, urlPath, body) {
  const payload = body === undefined ? 'undefined' : JSON.stringify(JSON.stringify(body));
  const script = [
    `fetch('http://127.0.0.1:8080${urlPath}', {`,
    `  method: '${method}',`,
    `  headers: { 'content-type': 'application/json' },`,
    `  body: ${payload},`,
    `})`,
    `  .then((res) => res.text())`,
    `  .then(console.log, (err) => { console.error(err.message); process.exit(1); });`,
  ].join(' ');

  return kubectlOutput(['-n', namespace, 'exec', pod, '--', 'node', '-e', script]);
}
