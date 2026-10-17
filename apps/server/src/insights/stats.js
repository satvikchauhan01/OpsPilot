// Numbers about how incidents went over a window of days, computed from plain documents so
// they can be checked without a database. Durations are in milliseconds.

const DAY_MS = 24 * 3600_000;
const MAX_LISTED = 300;

export function median(values) {
  const sorted = values.filter((value) => Number.isFinite(value)).sort((a, b) => a - b);
  if (sorted.length === 0) return null;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

export function utcDay(date) {
  return new Date(date).toISOString().slice(0, 10);
}

function groupBy(items, key) {
  const groups = new Map();
  for (const item of items) {
    const value = String(key(item));
    groups.set(value, [...(groups.get(value) ?? []), item]);
  }
  return groups;
}

function span(from, to) {
  return from && to ? new Date(to) - new Date(from) : null;
}

const FIX_TYPES = ['rollback', 'restart', 'scale'];
const FIX_OUTCOMES = { verified: 'verified', failed: 'failed', rejected: 'rejected' };

/**
 * incidents:      [{ _id, number, title, severity, status, suspectedService, startedAt, resolvedAt }]
 * investigations: [{ incident, status, startedAt, finishedAt, usage, result }]
 * actions:        [{ incident, status, type, source, finishedAt }]
 * postmortems:    [{ incident, status }]
 * usage:          [{ day, requests, inputTokens, outputTokens }] per UTC day
 */
export function summarize({ incidents, investigations, actions, postmortems, usage, since, until }) {
  const investigationsOf = groupBy(investigations, (run) => run.incident);
  const actionsOf = groupBy(actions, (action) => action.incident);

  const rows = incidents.map((incident) => {
    const id = String(incident._id);
    const runs = (investigationsOf.get(id) ?? []).filter((run) => run.status === 'completed' && run.finishedAt);
    runs.sort((a, b) => new Date(a.finishedAt) - new Date(b.finishedAt));
    const fixes = (actionsOf.get(id) ?? []).filter((action) => action.status === 'verified' && action.finishedAt);
    fixes.sort((a, b) => new Date(a.finishedAt) - new Date(b.finishedAt));
    // The latest finished investigation has the last word on the cause
    const top = runs.at(-1)?.result?.hypotheses?.[0];

    return {
      number: incident.number,
      title: incident.title,
      severity: incident.severity,
      status: incident.status,
      service: incident.suspectedService ?? null,
      cause: top?.causeType ?? null,
      startedAt: incident.startedAt,
      toRootCause: span(incident.startedAt, runs[0]?.finishedAt),
      toFix: span(incident.startedAt, fixes[0]?.finishedAt),
      toResolve: span(incident.startedAt, incident.resolvedAt),
    };
  });

  const timing = (key) => {
    const values = rows.map((row) => row[key]).filter((value) => value !== null);
    return { median: median(values), count: values.length };
  };

  return {
    window: { since, until, days: Math.round((until - since) / DAY_MS) },
    totals: {
      incidents: rows.length,
      open: rows.filter((row) => row.status !== 'resolved').length,
      resolved: rows.filter((row) => row.status === 'resolved').length,
      critical: rows.filter((row) => row.severity === 'critical').length,
    },
    timing: { toRootCause: timing('toRootCause'), toFix: timing('toFix'), toResolve: timing('toResolve') },
    perDay: perDay(rows, since, until),
    byService: breakdown(rows, (row) => row.service ?? 'unknown'),
    byCause: breakdown(rows, (row) => row.cause ?? 'not_investigated'),
    fixes: fixSummary(actions),
    ai: aiSummary(investigations, actions),
    postmortems: {
      draft: postmortems.filter((doc) => doc.status === 'draft').length,
      final: postmortems.filter((doc) => doc.status === 'final').length,
    },
    usage: usage.map(({ day, requests, inputTokens, outputTokens }) => ({ day, requests, inputTokens, outputTokens })),
    incidents: rows.slice(-MAX_LISTED),
  };
}

// One row per UTC day of the window, including quiet days, so a chart shows the gaps.
function perDay(rows, since, until) {
  const days = new Map();
  for (let at = new Date(utcDay(since)).getTime(); at <= until.getTime(); at += DAY_MS) {
    days.set(utcDay(at), { day: utcDay(at), critical: 0, warning: 0 });
  }
  for (const row of rows) {
    const day = days.get(utcDay(row.startedAt));
    if (day) day[row.severity === 'critical' ? 'critical' : 'warning'] += 1;
  }
  return [...days.values()];
}

function breakdown(rows, key) {
  return [...groupBy(rows, key)]
    .map(([name, group]) => ({
      name,
      incidents: group.length,
      medianToResolve: median(group.map((row) => row.toResolve)),
    }))
    .sort((a, b) => b.incidents - a.incidents || a.name.localeCompare(b.name));
}

function fixSummary(actions) {
  const decided = actions.filter((action) => FIX_OUTCOMES[action.status]);
  const byType = Object.fromEntries(
    FIX_TYPES.map((type) => {
      const ofType = decided.filter((action) => action.type === type);
      return [
        type,
        {
          verified: ofType.filter((action) => action.status === 'verified').length,
          failed: ofType.filter((action) => action.status === 'failed').length,
          rejected: ofType.filter((action) => action.status === 'rejected').length,
        },
      ];
    }),
  );
  const verified = decided.filter((action) => action.status === 'verified').length;
  const failed = decided.filter((action) => action.status === 'failed').length;
  return {
    byType,
    verified,
    failed,
    rejected: decided.filter((action) => action.status === 'rejected').length,
    // Of the fixes that ran, how many brought the metrics back
    successRate: verified + failed > 0 ? verified / (verified + failed) : null,
  };
}

function aiSummary(investigations, actions) {
  const finished = investigations.filter((run) => run.status === 'completed' || run.status === 'failed');
  const completed = finished.filter((run) => run.status === 'completed');
  const proposed = actions.filter((action) => action.source?.kind === 'investigation');
  const count = (status) => proposed.filter((action) => action.status === status).length;

  return {
    investigations: finished.length,
    completed: completed.length,
    failed: finished.length - completed.length,
    medianDuration: median(completed.map((run) => span(run.startedAt, run.finishedAt))),
    medianModelCalls: median(completed.map((run) => run.usage?.requests)),
    medianConfidence: median(completed.map((run) => run.result?.hypotheses?.[0]?.confidence)),
    // What happened to the fixes the AI proposed
    fixes: {
      proposed: proposed.length,
      approved: proposed.filter(
        (action) => !['proposed', 'rejected', 'superseded', 'cancelled'].includes(action.status),
      ).length,
      rejected: count('rejected'),
      verified: count('verified'),
      failed: count('failed'),
    },
  };
}
