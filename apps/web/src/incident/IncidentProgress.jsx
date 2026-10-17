import styles from './IncidentProgress.module.css';

// The four things that should happen to every incident, and how far this one got.
const STEPS = [
  {
    name: 'Root cause',
    state: ({ investigation }) =>
      ({ completed: 'done', queued: 'active', running: 'active', failed: 'failed' })[investigation],
  },
  {
    name: 'Fix approved',
    state: ({ fix }) =>
      fix === 'proposed'
        ? 'waiting'
        : ['approved', 'running', 'verifying', 'verified', 'failed'].includes(fix)
          ? 'done'
          : undefined,
  },
  {
    name: 'Fix verified',
    state: ({ fix }) =>
      fix === 'verified'
        ? 'done'
        : fix === 'failed'
          ? 'failed'
          : ['approved', 'running', 'verifying'].includes(fix)
            ? 'active'
            : undefined,
  },
  {
    name: 'Postmortem',
    state: ({ postmortem }) => ({ final: 'done', draft: 'waiting', drafting: 'active', failed: 'failed' })[postmortem],
  },
];

const STATE_WORD = { done: 'done', active: 'in progress', waiting: 'waiting', failed: 'failed' };

export function IncidentProgress({ progress }) {
  const steps = STEPS.map((step) => ({ name: step.name, state: step.state(progress ?? {}) }));
  const summary = steps.map((step) => `${step.name}: ${STATE_WORD[step.state] ?? 'not yet'}`).join(', ');

  return (
    <span className={styles.progress} title={summary}>
      {steps.map((step) => (
        <span key={step.name} className={styles.step} data-state={step.state} />
      ))}
      <span className="visually-hidden">{summary}</span>
    </span>
  );
}
