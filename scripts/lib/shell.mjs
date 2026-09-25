import { spawnSync } from 'node:child_process';

// Thin wrappers around the CLIs these scripts drive (docker, minikube, kubectl).
// Arguments are always passed as arrays and never go through a shell, so nothing needs quoting.

// `input`, when given, is written to the command's stdin (e.g. a manifest for `kubectl apply -f -`).
export function run(command, args, { input, ...options } = {}) {
  const stdio = input === undefined ? 'inherit' : ['pipe', 'inherit', 'inherit'];
  const result = spawnSync(command, args, { stdio, input, ...options });
  check(command, args, result);
}

export function output(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: 'utf8', ...options });
  check(command, args, result);
  return result.stdout.trim();
}

export function isInstalled(command) {
  return spawnSync(command, ['--help'], { stdio: 'ignore' }).error?.code !== 'ENOENT';
}

export function step(message) {
  console.log(`\n==> ${message}`);
}

function check(command, args, result) {
  if (result.error?.code === 'ENOENT') throw new Error(`${command} is not installed or not on PATH`);
  if (result.error) throw result.error;
  if (result.status === 0) return;

  const shown = args.length > 6 ? [...args.slice(0, 6), '...'] : args;
  const details = result.stderr?.trim();
  throw new Error(`${command} ${shown.join(' ')} failed${details ? `:\n${details}` : ''}`);
}
