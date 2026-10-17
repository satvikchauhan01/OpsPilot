// How far an incident has come, for lists that show it at a glance: the state of its latest
// investigation, its furthest fix and its postmortem.

// A verified fix outranks one still running, which outranks one waiting, and so on.
const FIX_ORDER = ['rejected', 'failed', 'proposed', 'approved', 'running', 'verifying', 'verified'];

export function furthestFix(statuses) {
  let best = null;
  for (const status of statuses) {
    if (FIX_ORDER.indexOf(status) > FIX_ORDER.indexOf(best)) best = status;
  }
  return best;
}

// `investigations` are { incident, status } with the latest per incident; `actions` and
// `postmortems` are { incident, status } documents.
export function progressByIncident({ investigations, actions, postmortems }) {
  const progress = new Map();
  const entry = (id) => {
    const key = String(id);
    if (!progress.has(key)) progress.set(key, { investigation: null, fix: null, postmortem: null });
    return progress.get(key);
  };

  for (const { incident, status } of investigations) entry(incident).investigation = status;
  for (const { incident, status } of postmortems) entry(incident).postmortem = status;

  const fixes = new Map();
  for (const { incident, status } of actions) {
    const key = String(incident);
    fixes.set(key, [...(fixes.get(key) ?? []), status]);
  }
  for (const [key, statuses] of fixes) entry(key).fix = furthestFix(statuses);

  return progress;
}
