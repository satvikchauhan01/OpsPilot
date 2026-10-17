import { ACTION_LABEL, CAUSE_LABEL } from '../lib/labels.js';
import { LIMITS } from '../topology/health.js';

// Everything the replay shows at a moment `t` (epoch ms) is worked out here from what was
// recorded, so the page only has to move `t`.

const LEAD_MS = 2 * 60_000;
const CAUSE_LOOKBACK_MS = 10 * 60_000;
const TAIL_MS = 60_000;
const ms = (date) => (date ? new Date(date).getTime() : null);

// From a little before the first alert (or the deploy that probably caused it) to a minute
// after the incident resolved. Live incidents run up to now.
export function replayWindow(incident, entries, now) {
  const started = ms(incident.startedAt);
  const cause = entries
    .filter((entry) => entry.kind === 'change' && ['deploy', 'config'].includes(entry.subkind))
    .map((entry) => ms(entry.at))
    .filter((at) => at < started && at >= started - CAUSE_LOOKBACK_MS)
    .at(-1);
  const start = Math.min(started - LEAD_MS, cause ? cause - 30_000 : Infinity);
  const end = incident.resolvedAt ? ms(incident.resolvedAt) + TAIL_MS : now;
  return { start, end };
}

export function eventsIn(entries, { start, end }) {
  return entries.filter((entry) => ms(entry.at) >= start && ms(entry.at) <= end);
}

// What a fix's status was at `t`, from the times it passed each stage.
function actionStatusAt(action, t) {
  if (ms(action.finishedAt) <= t) return action.status;
  if (['superseded', 'cancelled'].includes(action.status))
    return ms(action.updatedAt) <= t ? action.status : 'proposed';
  if (action.status === 'rejected') return ms(action.decidedAt) <= t ? 'rejected' : 'proposed';
  if (ms(action.rolledOutAt) <= t) return 'verifying';
  if (ms(action.startedAt) <= t) return 'running';
  if (ms(action.decidedAt) <= t) return 'approved';
  return 'proposed';
}

// The incident, its investigation, fixes and postmortem as they stood at `t`, in the
// shapes journeyOf() takes.
export function snapshotAt(t, { incident, investigation, actions = [], postmortem }) {
  const run =
    investigation && ms(investigation.startedAt) <= t
      ? {
          ...investigation,
          status: ms(investigation.finishedAt) <= t ? investigation.status : 'running',
          steps: investigation.steps.filter((step) => ms(step.at) <= t),
        }
      : null;
  const fixes = actions
    .filter((action) => ms(action.proposedAt) <= t)
    .map((action) => ({ ...action, status: actionStatusAt(action, t) }));
  const document =
    postmortem && ms(postmortem.draftedAt) <= t
      ? { ...postmortem, status: ms(postmortem.finalizedAt) <= t ? 'final' : 'draft' }
      : null;

  return {
    incident: { ...incident, resolvedAt: ms(incident.resolvedAt) <= t ? incident.resolvedAt : null },
    investigation: run,
    actions: fixes,
    postmortem: document,
  };
}

function alertsFiringAt(alerts, t) {
  return alerts.filter((alert) => ms(alert.startsAt) <= t && (!alert.endsAt || ms(alert.endsAt) > t));
}

// The last sample at or before `t`, so the replay never shows a value from the future.
function valueAt(points, t) {
  let value = null;
  for (const [at, v] of points) {
    if (at > t) break;
    if (v !== null) value = v;
  }
  return value;
}

/**
 * The service map at `t`. The graph's shape comes from the incident's topology; each
 * service's numbers come from the recorded metrics at that moment, and its colour from the
 * alerts firing on it then. Edge failures are estimated from the called service's error
 * rate, since traces aren't kept per call.
 */
export function mapAt(t, { topology, metrics, alerts }) {
  const series = (metric, service) => metrics?.[metric]?.find((entry) => entry.service === service)?.points ?? [];
  const firing = alertsFiringAt(alerts, t);
  const health = {};
  for (const alert of firing) {
    if (health[alert.service] !== 'critical') health[alert.service] = alert.severity;
  }

  const nodes = topology.nodes.map((node) => {
    if (node.kind === 'external') return node;
    const alertNames = [...new Set(firing.filter((alert) => alert.service === node.id).map((alert) => alert.name))];
    return {
      ...node,
      rps: valueAt(series('rps', node.id), t),
      errorRatio: valueAt(series('errorRatio', node.id), t),
      p95: valueAt(series('p95', node.id), t),
      note: alertNames.length > 0 ? alertNames.join(', ') : undefined,
    };
  });
  const byId = new Map(nodes.map((node) => [node.id, node]));

  const edges = topology.edges.map((edge) => {
    const target = byId.get(edge.target);
    const recorded = topology.nodes.find((node) => node.id === edge.target)?.rps;
    const scale = typeof target?.rps === 'number' && recorded ? target.rps / recorded : 1;
    const errorRatio = target?.errorRatio ?? null;
    return {
      ...edge,
      rps: edge.rps * scale,
      errorRatio,
      failing: errorRatio === null ? health[edge.target] === 'critical' : errorRatio > LIMITS.errorRatio,
    };
  });

  for (const node of nodes) {
    if (node.kind !== 'external' && !health[node.id]) health[node.id] = 'ok';
  }
  return { nodes, edges, health, firing };
}

/**
 * One or two sentences on where things stood at `t`, from the snapshot and the events so
 * far. `alerts` firing and `opened` say whether the incident existed yet.
 */
export function narrativeAt(t, snapshot, { firing, opened, past }) {
  const { incident, investigation, actions } = snapshot;
  const fix = actions.find((action) => !['superseded', 'cancelled', 'rejected'].includes(action.status));
  const top = investigation?.status === 'completed' ? investigation.result?.hypotheses?.[0] : null;
  const fixLabel = fix && `${ACTION_LABEL[fix.type]} ${fix.plan.summary}`;

  if (incident.resolvedAt) {
    return {
      tone: 'ok',
      phase: 'Resolved',
      text: 'Every alert has been quiet for 5 minutes, so OpsPilot closed the incident.',
    };
  }
  if (fix?.status === 'verified') {
    return {
      tone: 'ok',
      phase: 'Fix verified',
      text: 'The metrics stayed inside their limits for the last minute of the check. The incident closes once its alerts stay quiet.',
    };
  }
  if (fix?.status === 'failed') {
    return { tone: 'critical', phase: 'Fix failed', text: fix.error ?? 'The fix did not bring the metrics back.' };
  }
  if (fix?.status === 'verifying') {
    return {
      tone: 'info',
      phase: 'Verifying',
      text: `${fixLabel} rolled out. OpsPilot watches the metrics before it calls the fix good.`,
    };
  }
  if (fix?.status === 'running' || fix?.status === 'approved') {
    return { tone: 'info', phase: 'Rolling out', text: `Approved by ${fix.decidedBy}. ${fixLabel} is rolling out.` };
  }
  if (fix?.status === 'proposed') {
    return {
      tone: 'warning',
      phase: 'Waiting for approval',
      text: `${top ? `Root cause: ${top.title}. ` : ''}Nothing changes until a person approves: ${fixLabel}.`,
    };
  }
  if (top) {
    const cause = CAUSE_LABEL[top.causeType] ?? top.causeType;
    return {
      tone: 'info',
      phase: 'Root cause found',
      text: `${top.title} (${cause}, ${Math.round(top.confidence * 100)}% confident).`,
    };
  }
  if (investigation?.status === 'running') {
    const step = investigation.steps.at(-1);
    return {
      tone: 'info',
      phase: 'AI investigating',
      text: step
        ? `Step ${investigation.steps.length}: ${step.title}`
        : 'Gathering the alerts, metrics and recent changes.',
    };
  }
  if (opened) {
    return {
      tone: 'critical',
      phase: 'Incident open',
      text: 'Related alerts are grouped into this incident. The AI starts investigating about a minute after it opens.',
    };
  }
  if (firing.length > 0) {
    return {
      tone: 'warning',
      phase: 'Alerting',
      text: `${firing.map((alert) => `${alert.name} on ${alert.service}`).join(', ')}.`,
    };
  }
  const last = past.at(-1);
  return {
    tone: 'neutral',
    phase: 'Before the incident',
    text: last ? `Last change: ${last.title}. No alert yet.` : 'Everything looks normal. No alert yet.',
  };
}
