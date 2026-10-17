import { ToneMark } from './Tags.jsx';
import styles from './Stat.module.css';

// A row of headline numbers, separated by hairlines rather than boxed into cards.
export function Stats({ children, label }) {
  return (
    <dl className={styles.stats} aria-label={label}>
      {children}
    </dl>
  );
}

// One headline number: what it measures, the value in large digits, and a line of context.
// A tone adds the matching status shape next to the label.
export function Stat({ label, value, unit, detail, tone, size = 'lg' }) {
  return (
    <div className={styles.stat} data-tone={tone} data-size={size}>
      <dt className={styles.label}>
        {tone && <ToneMark tone={tone} />}
        {label}
      </dt>
      <dd className={styles.value}>
        {value}
        {unit && <span className={styles.unit}>{unit}</span>}
      </dd>
      {detail && <dd className={styles.detail}>{detail}</dd>}
    </div>
  );
}
