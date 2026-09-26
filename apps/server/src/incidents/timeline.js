import { describeAction, describeDone } from '../remediation/catalog.js';

// Merges everything known about an incident into one chronological list for the UI and
// for the investigator.

const CHANGE_TONE = {
  deploy: 'info',
  config: 'info',
  restart: 'info',
  scale: 'info',
  rollout: 'neutral',
  warning: 'warning',
};

// When two entries share a timestamp, show the likely cause first.
const ORDER = ['change', 'k8s', 'alert', 'incident', 'investigation', 'action'];

// Kubernetes repeats warnings like failed probes every few seconds during a rollout.
// Repeats of the same warning on the same service this close together become one entry.
const REPEAT_WINDOW_MS = 3 * 60_000;

export function buildTimeline({ incident, alerts = [], changes = [], investigations = [], actions = [] }) {
  const entries = [];

  for (const alert of alerts) {
    entries.push({
      id: `alert-${alert.id}-firing`,
      at: new Date(alert.startsAt),
      kind: 'alert',
      service: alert.service,
      title: `${alert.name} firing on ${alert.service}`,
      detail: alert.summary,
      tone: alert.severity === 'critical' ? 'critical' : 'warning',
    });
    if (alert.status === 'resolved' && alert.endsAt) {
      entries.push({
        id: `alert-${alert.id}-resolved`,
        at: new Date(alert.endsAt),
        kind: 'alert',
        service: alert.service,
        title: `${alert.name} resolved on ${alert.service}`,
        tone: 'ok',
      });
    }
  }

  for (const change of changes) {
    const isRuntimeEvent = change.kind === 'pod_restart' || change.kind === 'warning';
    entries.push({
      id: `change-${change.id}`,
      at: new Date(change.at),
      kind: isRuntimeEvent ? 'k8s' : 'change',
      subkind: change.kind,
      service: change.service,
      title: change.summary,
      // A deploy's change-cause says why it happened. Other changes already say it all in the summary.
      detail: change.kind === 'deploy' ? change.details?.changeCause : undefined,
      reason: change.details?.reason,
      count: change.occurrences ?? 1,
      tone: change.kind === 'pod_restart' ? restartTone(change) : (CHANGE_TONE[change.kind] ?? 'neutral'),
    });
  }

  for (const [index, event] of incident.history.entries()) {
    if (event.type === 'alert') continue; // already listed from the alert itself
    entries.push({
      id: `incident-${index}`,
      at: new Date(event.at),
      kind: 'incident',
      title: describeHistory(incident, event),
      detail: event.note,
      by: event.by,
      tone: event.to === 'resolved' ? 'ok' : 'neutral',
    });
  }

  for (const investigation of investigations.filter((run) => run.startedAt)) {
    entries.push({
      id: `investigation-${investigation.id}-started`,
      at: new Date(investigation.startedAt),
      kind: 'investigation',
      title: `AI investigation started (${investigation.trigger})`,
      tone: 'neutral',
    });
    if (investigation.finishedAt) {
      const top = investigation.result?.hypotheses?.[0];
      entries.push({
        id: `investigation-${investigation.id}-finished`,
        at: new Date(investigation.finishedAt),
        kind: 'investigation',
        service: top?.service,
        title: investigation.status === 'completed' ? 'AI investigation finished' : 'AI investigation failed',
        detail: top ? `Most likely: ${top.title}` : investigation.error,
        tone: investigation.status === 'completed' ? 'info' : 'warning',
      });
    }
  }

  for (const action of actions) entries.push(...actionEntries(action));

  entries.sort((a, b) => a.at - b.at || ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind));
  return collapseRepeatedWarnings(entries);
}

// A fix appears when it was proposed, decided on, rolled out, and verified or failed.
// Proposals nobody decided on before they were replaced or cancelled are left out.
function actionEntries(action) {
  if (action.status === 'superseded' || action.status === 'cancelled') return [];

  const id = `action-${action._id ?? action.id}`;
  const base = { kind: 'action', service: action.params.service };
  const label = describeAction(action);
  const entries = [
    {
      ...base,
      id: `${id}-proposed`,
      at: new Date(action.proposedAt),
      title: `Proposed: ${label}`,
      detail: action.reason,
      by: action.proposedBy,
      tone: 'neutral',
    },
  ];

  if (action.decidedAt) {
    const rejected = action.status === 'rejected';
    entries.push({
      ...base,
      id: `${id}-decided`,
      at: new Date(action.decidedAt),
      title: `${rejected ? 'Rejected' : 'Approved'}: ${label}`,
      detail: rejected ? action.rejectionReason : undefined,
      by: action.decidedBy,
      tone: rejected ? 'neutral' : 'info',
    });
  }
  if (action.rolledOutAt) {
    entries.push({
      ...base,
      id: `${id}-done`,
      at: new Date(action.rolledOutAt),
      title: describeDone(action),
      tone: 'info',
    });
  }
  if (action.status === 'verified') {
    entries.push({
      ...base,
      id: `${id}-verified`,
      at: new Date(action.finishedAt),
      title: 'Fix verified: the metrics are back within their limits',
      tone: 'ok',
    });
  }
  if (action.status === 'failed') {
    entries.push({
      ...base,
      id: `${id}-failed`,
      at: new Date(action.finishedAt),
      title: `Fix failed: ${label}`,
      detail: action.error,
      tone: 'critical',
    });
  }
  return entries;
}

function collapseRepeatedWarnings(entries) {
  const latest = new Map();
  const result = [];

  for (const entry of entries) {
    if (entry.subkind !== 'warning') {
      result.push(entry);
      continue;
    }
    const key = `${entry.service}/${entry.reason}`;
    const previous = latest.get(key);
    if (previous && entry.at - previous.until <= REPEAT_WINDOW_MS) {
      previous.count += entry.count;
      previous.until = entry.at;
      continue;
    }
    const merged = { ...entry, until: entry.at };
    latest.set(key, merged);
    result.push(merged);
  }
  return result;
}

function describeHistory(incident, event) {
  if (event.type === 'opened') return `INC-${incident.number} opened`;
  if (event.type === 'status') return `Status changed from ${event.from} to ${event.to}`;
  return 'Note added';
}

function restartTone(change) {
  return change.details?.reason === 'OOMKilled' ? 'critical' : 'warning';
}
