import { clock, duration } from '../lib/format.js';
import styles from './Journey.module.css';

const STATE_WORD = { done: 'done', active: 'in progress', waiting: 'waiting for a person', failed: 'did not happen' };

// The incident's path as a row of stations, each with how long after the start it was
// reached. A step waiting for a person stands out: that is where someone is needed.
export function Journey({ steps, startedAt, vertical = false }) {
  const start = new Date(startedAt).getTime();
  return (
    <ol className={styles.journey} data-vertical={vertical || undefined} aria-label="How the incident went">
      {steps.map((step) => (
        <li key={step.key} className={styles.step} data-state={step.state}>
          <span className={styles.mark} aria-hidden="true" />
          <span className={styles.label}>{step.label}</span>
          <span className={styles.when} title={step.at ? clock(step.at) : undefined}>
            {step.at && step.key !== 'detected'
              ? `+${duration(new Date(step.at) - start)}`
              : step.key === 'detected' && step.state
                ? clock(startedAt)
                : (step.note ?? (step.state === 'waiting' ? 'needs you' : step.state === 'active' ? 'working' : ''))}
          </span>
          <span className="visually-hidden">{STATE_WORD[step.state] ?? 'not yet'}</span>
        </li>
      ))}
    </ol>
  );
}
