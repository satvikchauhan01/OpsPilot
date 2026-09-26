import { useState } from 'react';
import { useHoverTime } from '../charts/HoverTime.jsx';
import { clock } from '../lib/format.js';
import { ServiceChip, ToneMark } from '../components/Tags.jsx';
import styles from './Timeline.module.css';

const FILTERS = [
  { kind: null, label: 'All' },
  { kind: 'change', label: 'Changes' },
  { kind: 'alert', label: 'Alerts' },
  { kind: 'k8s', label: 'Kubernetes' },
  { kind: 'investigation', label: 'AI' },
  { kind: 'action', label: 'Fixes' },
  { kind: 'incident', label: 'Status' },
];

const KIND_LABEL = {
  change: 'change',
  alert: 'alert',
  k8s: 'kubernetes',
  incident: 'incident',
  investigation: 'ai',
  action: 'action',
};

// Entries within this distance of the shared hover time are highlighted.
const HOVER_MATCH_MS = 45_000;

export function Timeline({ entries }) {
  const [filter, setFilter] = useState(null);
  const { time, setTime } = useHoverTime();

  const visible = filter ? entries.filter((entry) => entry.kind === filter) : entries;
  const active = time === null ? null : nearest(visible, time);
  const counts = Object.fromEntries(
    FILTERS.map(({ kind }) => [kind, kind ? entries.filter((e) => e.kind === kind).length : entries.length]),
  );

  return (
    <div className={styles.timeline}>
      <div className={styles.filters} role="group" aria-label="Show entries of kind">
        {FILTERS.filter(({ kind }) => !kind || counts[kind] > 0).map(({ kind, label }) => (
          <button key={label} type="button" aria-pressed={filter === kind} onClick={() => setFilter(kind)}>
            {label}
            <span className={styles.filterCount}>{counts[kind]}</span>
          </button>
        ))}
      </div>

      <ol className={styles.list}>
        {visible.map((entry) => {
          const at = new Date(entry.at).getTime();
          return (
            <li
              key={entry.id}
              className={styles.entry}
              data-kind={entry.kind}
              data-active={entry.id === active?.id || undefined}
              tabIndex={0}
              onPointerEnter={() => setTime(at)}
              onPointerLeave={() => setTime(null)}
              onFocus={() => setTime(at)}
              onBlur={() => setTime(null)}
            >
              <time className={styles.time} dateTime={entry.at}>
                {clock(entry.at)}
              </time>
              <span className={styles.rail}>
                <ToneMark tone={entry.tone} />
              </span>
              <div className={styles.body}>
                <p className={styles.title}>
                  {entry.title}
                  {entry.count > 1 && <span className={styles.count}>×{entry.count}</span>}
                </p>
                {entry.detail && <p className={styles.detail}>{entry.detail}</p>}
                <p className={styles.meta}>
                  <span className={styles.kind}>{KIND_LABEL[entry.kind]}</span>
                  {entry.service && <ServiceChip service={entry.service} />}
                  {entry.by && entry.by !== 'system' && <span>by {entry.by}</span>}
                </p>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function nearest(entries, time) {
  let best = null;
  for (const entry of entries) {
    const distance = Math.abs(new Date(entry.at).getTime() - time);
    if (distance <= HOVER_MATCH_MS && (!best || distance < best.distance)) best = { id: entry.id, distance };
  }
  return best;
}
