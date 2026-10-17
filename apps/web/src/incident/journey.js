// The path every incident should take, and how far one has come along it. Shared by the
// incident page, the replay and the demo page.

const IN_FLIGHT = ['approved', 'running', 'verifying'];

const JOURNEY = [
  { key: 'detected', label: 'Detected' },
  { key: 'rootCause', label: 'Root cause' },
  { key: 'proposed', label: 'Fix proposed' },
  { key: 'approved', label: 'Approved' },
  { key: 'verified', label: 'Verified' },
  { key: 'resolved', label: 'Resolved' },
  { key: 'postmortem', label: 'Postmortem' },
];

// The fix that tells the story best: one that worked, else one under way, else one that
// failed, else one that was turned down.
function mainFix(actions = []) {
  const live = actions.filter((action) => action.status !== 'superseded' && action.status !== 'cancelled');
  return (
    live.find((action) => action.status === 'verified') ??
    live.find((action) => action.status === 'proposed' || IN_FLIGHT.includes(action.status)) ??
    live.find((action) => action.status === 'failed') ??
    live.find((action) => action.status === 'rejected') ??
    null
  );
}

/**
 * Each step with its state (done, active, waiting for a person, failed, or not yet) and
 * when it happened. `investigation` is the latest one or null, `postmortem` null when
 * there is none.
 */
export function journeyOf({ incident, investigation, actions, postmortem }) {
  const fix = mainFix(actions);
  const run = investigation;

  const states = {
    detected: { state: 'done', at: incident.startedAt },
    rootCause: !run
      ? {}
      : run.status === 'completed'
        ? { state: 'done', at: run.finishedAt }
        : run.status === 'failed'
          ? { state: 'failed', at: run.finishedAt }
          : { state: 'active' },
    proposed: fix ? { state: 'done', at: fix.proposedAt } : {},
    approved: !fix
      ? {}
      : fix.status === 'proposed'
        ? { state: 'waiting' }
        : fix.status === 'rejected'
          ? { state: 'failed', at: fix.decidedAt, note: 'rejected' }
          : { state: 'done', at: fix.decidedAt },
    verified: !fix
      ? {}
      : fix.status === 'verified'
        ? { state: 'done', at: fix.finishedAt }
        : fix.status === 'failed'
          ? { state: 'failed', at: fix.finishedAt }
          : IN_FLIGHT.includes(fix.status)
            ? { state: 'active' }
            : {},
    resolved: incident.resolvedAt ? { state: 'done', at: incident.resolvedAt } : {},
    postmortem: !postmortem
      ? {}
      : {
          final: { state: 'done', at: postmortem.finalizedAt },
          draft: { state: 'waiting', at: postmortem.draftedAt, note: 'draft' },
          drafting: { state: 'active' },
          failed: { state: 'failed' },
        }[postmortem.status],
  };

  return JOURNEY.map((step) => ({ ...step, ...states[step.key] }));
}
