// Measures how often OpsPilot's AI investigation names the right root cause (REQUIREMENTS.md, AI-6).
// Each run breaks the shop in a known way, waits for the incident and its automatic
// investigation, scores the top hypothesis, then puts everything back before the next run.
// Results go to docs/evaluation.md.
//
//   npm run evaluate                       every scenario, 5 runs each
//   npm run evaluate -- --runs 2 --only bad-deploy,memory-leak
//
// Needs the local cluster (npm run cluster:up) and the server (npm run dev), and signs in
// with ADMIN_EMAIL / ADMIN_PASSWORD from .env.

import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { setTimeout as sleep } from 'node:timers/promises';
import { ROOT } from './lib/kube.mjs';
import { run } from './lib/shell.mjs';

const API = process.env.OPSPILOT_URL ?? 'http://localhost:4000';
const PROMETHEUS = process.env.PROMETHEUS_URL ?? 'http://localhost:19090';

// What a correct investigation says for each scenario: the service where it starts, and
// the cause types that describe it.
const EXPECTED = {
  'bad-deploy': { id: 'S1', service: 'checkout', causes: ['bad_deploy'] },
  'memory-leak': { id: 'S2', service: 'inventory', causes: ['memory_leak'] },
  'payments-latency': { id: 'S3', service: 'payments', causes: ['slow_dependency'] },
  'traffic-spike': { id: 'S4', service: 'payments', causes: ['resource_saturation', 'traffic_surge'] },
};

const { values: options } = parseArgs({
  options: {
    runs: { type: 'string', default: '5' },
    only: { type: 'string' },
  },
});
const runsPerScenario = Number(options.runs);
const scenarios = options.only ? options.only.split(',') : Object.keys(EXPECTED);

try {
  process.loadEnvFile(path.join(ROOT, '.env'));
} catch {
  // settings can also come from the environment
}

const session = await signIn();
const results = [];

for (const scenario of scenarios) {
  for (let attempt = 1; attempt <= runsPerScenario; attempt += 1) {
    const label = `${EXPECTED[scenario].id} ${scenario} run ${attempt}/${runsPerScenario}`;
    console.log(`\n=== ${label}`);
    const result = await evaluateOnce(scenario);
    results.push({ scenario, attempt, ...result });
    console.log(result.correct ? `correct: ${result.summary}` : `WRONG or failed: ${result.summary}`);
    writeReport(results);
  }
}

console.log(`\nDone. ${results.filter((r) => r.correct).length}/${results.length} correct. See docs/evaluation.md`);

async function evaluateOnce(scenario) {
  await settle();
  const previous = await latestIncidentNumber();
  const startedAt = Date.now();
  run('node', [path.join(ROOT, 'scripts', 'scenario.mjs'), scenario], { stdio: 'ignore' });

  try {
    const incident = await waitFor('an incident', 6 * 60_000, async () => {
      const [latest] = await api('/api/incidents?status=active&limit=1');
      return latest && latest.number > previous ? latest : null;
    });
    console.log(`INC-${incident.number} opened after ${seconds(startedAt)}s`);

    const investigation = await waitFor('the investigation', 12 * 60_000, async () => {
      const latest = await api(`/api/incidents/${incident.number}/investigations/latest`).catch(() => null);
      return latest && (latest.status === 'completed' || latest.status === 'failed') ? latest : null;
    });

    const top = investigation.result?.hypotheses?.[0];
    const expected = EXPECTED[scenario];
    const correct = Boolean(top && top.service === expected.service && expected.causes.includes(top.causeType));
    return {
      correct,
      incident: incident.number,
      status: investigation.status,
      top: top
        ? { service: top.service, causeType: top.causeType, confidence: top.confidence, title: top.title }
        : null,
      model: investigation.model,
      requests: investigation.usage?.requests ?? 0,
      evidence: investigation.evidence?.length ?? 0,
      seconds: Math.round((new Date(investigation.finishedAt) - new Date(investigation.startedAt)) / 1000),
      summary: top
        ? `${top.service} / ${top.causeType} (${Math.round(top.confidence * 100)}%): ${top.title}`
        : investigation.error,
    };
  } catch (err) {
    return { correct: false, status: 'timeout', top: null, summary: err.message };
  } finally {
    await cleanUp();
  }
}

// Undo the scenario and close whatever incident it opened, so the next run starts clean.
async function cleanUp() {
  run('node', [path.join(ROOT, 'scripts', 'scenario.mjs'), 'reset'], { stdio: 'ignore' });
  for (const incident of await api('/api/incidents?status=active')) {
    await api(`/api/incidents/${incident.number}/status`, {
      method: 'POST',
      body: { status: 'resolved', note: 'closed by the evaluation run' },
    }).catch(() => {});
  }
}

// Waits until Prometheus has no pending or firing alerts.
async function settle() {
  await waitFor('all alerts to clear', 8 * 60_000, async () => {
    const res = await fetch(`${PROMETHEUS}/api/v1/alerts`);
    const body = await res.json();
    return body.data.alerts.length === 0;
  });
}

async function latestIncidentNumber() {
  const [latest] = await api('/api/incidents?limit=1');
  return latest?.number ?? 0;
}

async function signIn() {
  const { ADMIN_EMAIL: email, ADMIN_PASSWORD: password } = process.env;
  if (!email || !password) throw new Error('ADMIN_EMAIL and ADMIN_PASSWORD must be set (in .env)');
  const res = await fetch(`${API}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) throw new Error(`could not sign in to ${API}: HTTP ${res.status}`);
  return res.headers
    .getSetCookie()
    .map((cookie) => cookie.split(';')[0])
    .join('; ');
}

async function api(route, { method = 'GET', body } = {}) {
  const res = await fetch(`${API}${route}`, {
    method,
    headers: { cookie: session, ...(body && { 'content-type': 'application/json' }) },
    body: body && JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${method} ${route}: HTTP ${res.status}`);
  return res.status === 204 ? null : res.json();
}

async function waitFor(what, timeoutMs, check) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = await check().catch(() => null);
    if (value) return value;
    await sleep(5000);
  }
  throw new Error(`gave up waiting for ${what}`);
}

function seconds(since) {
  return Math.round((Date.now() - since) / 1000);
}

function writeReport(rows) {
  const byScenario = scenarios.map((scenario) => {
    const runs = rows.filter((row) => row.scenario === scenario);
    return { scenario, runs, correct: runs.filter((row) => row.correct).length };
  });

  const lines = [
    '# AI investigation: evaluation',
    '',
    'Requirement AI-6: for each failure scenario, the correct root cause (right service and right cause',
    'type) must be ranked first in at least 4 out of 5 runs. Produced by `npm run evaluate`.',
    '',
    `Last run: ${new Date().toISOString()} · models used: ${[...new Set(rows.map((row) => row.model).filter(Boolean))].join(', ') || 'none'}`,
    '',
    '| Scenario | Expected | Correct | Required | Result |',
    '|----------|----------|---------|----------|--------|',
    ...byScenario.map(({ scenario, runs, correct }) => {
      const expected = EXPECTED[scenario];
      const required = Math.ceil(runs.length * 0.8);
      return `| ${expected.id} \`${scenario}\` | ${expected.service} / ${expected.causes.join(' or ')} | ${correct}/${runs.length} | ${required}/${runs.length} | ${correct >= required ? 'pass' : 'FAIL'} |`;
    }),
    '',
    '## Runs',
    '',
    '| Scenario | Run | Incident | Top hypothesis | Confidence | Model calls | Evidence | Time | Correct |',
    '|----------|-----|----------|----------------|------------|-------------|----------|------|---------|',
    ...rows.map((row) => {
      const top = row.top
        ? `${row.top.service} / ${row.top.causeType}: ${row.top.title.replaceAll('|', '/')}`
        : row.summary;
      return `| ${EXPECTED[row.scenario].id} | ${row.attempt} | ${row.incident ? `INC-${row.incident}` : '—'} | ${top} | ${row.top ? `${Math.round(row.top.confidence * 100)}%` : '—'} | ${row.requests ?? '—'} | ${row.evidence ?? '—'} | ${row.seconds ? `${row.seconds}s` : '—'} | ${row.correct ? 'yes' : 'no'} |`;
    }),
    '',
  ];
  writeFileSync(path.join(ROOT, 'docs', 'evaluation.md'), lines.join('\n'));
}
