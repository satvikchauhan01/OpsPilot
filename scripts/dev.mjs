// Runs the API server and the web dev server side by side, with prefixed output.
// The server restarts on file changes (node --watch) and the web app hot-reloads (Vite).
//
//   npm run dev

import { spawn, spawnSync } from 'node:child_process';
import readline from 'node:readline';

const APPS = [
  { name: 'server', color: 36, workspace: '@opspilot/server' },
  { name: 'web', color: 35, workspace: '@opspilot/web' },
];

const isWindows = process.platform === 'win32';

const children = APPS.map(({ name, color, workspace }) => {
  // npm is a .cmd script on Windows, which only starts through a shell
  const child = spawn('npm', ['run', 'dev', '-w', workspace], { shell: isWindows, stdio: ['ignore', 'pipe', 'pipe'] });
  const prefix = `\x1b[${color}m${name.padEnd(6)}\x1b[0m| `;

  for (const stream of [child.stdout, child.stderr]) {
    readline.createInterface({ input: stream }).on('line', (line) => console.log(prefix + line));
  }
  child.on('exit', (code) => {
    console.log(`${prefix}stopped (exit code ${code})`);
    shutdown(code ?? 0);
  });
  return child;
});

let stopping = false;

function shutdown(code) {
  if (stopping) return;
  stopping = true;
  for (const child of children) {
    // Killing the shell alone would leave node running on Windows, so take the whole tree
    if (isWindows) spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
    else child.kill('SIGTERM');
  }
  process.exit(code);
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));
