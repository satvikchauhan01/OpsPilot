import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { parseEnv } from 'node:util';

// Secrets that nobody needs to choose by hand. They're generated once and kept in .env.
const GENERATED = { SESSION_SECRET: 32, ALERTMANAGER_WEBHOOK_TOKEN: 24 };

// Fills in any generated secret that is missing or empty in the .env file, leaving every
// other line untouched. Returns the resulting settings.
export function ensureGeneratedSecrets(envPath) {
  let text = existsSync(envPath) ? readFileSync(envPath, 'utf8') : '';
  const current = parseEnv(text);
  const added = [];

  for (const [name, bytes] of Object.entries(GENERATED)) {
    if (current[name]) continue;
    const line = `${name}=${randomBytes(bytes).toString('hex')}`;
    const emptyAssignment = new RegExp(`^${name}=[ \\t]*$`, 'm');
    if (emptyAssignment.test(text)) text = text.replace(emptyAssignment, line);
    else text += `${text && !text.endsWith('\n') ? '\n' : ''}${line}\n`;
    added.push(name);
  }

  if (added.length > 0) writeFileSync(envPath, text);
  return { settings: parseEnv(text), added };
}

// Sets one setting in the .env file, replacing its line if there is one. Returns whether the
// file changed.
export function setEnvValue(envPath, name, value) {
  const text = existsSync(envPath) ? readFileSync(envPath, 'utf8') : '';
  if (parseEnv(text)[name] === value) return false;

  const line = `${name}=${value}`;
  const existing = new RegExp(`^[ \\t]*${name}[ \\t]*=.*$`, 'm');
  const next = existing.test(text)
    ? text.replace(existing, line)
    : `${text}${text && !text.endsWith('\n') ? '\n' : ''}${line}\n`;
  writeFileSync(envPath, next);
  return true;
}
