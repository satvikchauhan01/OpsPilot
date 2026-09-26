import styles from './Score.module.css';

// A score between 0 and 1 (a confidence, a similarity) as a percentage over a thin bar.
export function Score({ value, label, size = 'small' }) {
  const percent = Math.round(Math.min(1, Math.max(0, value)) * 100);
  return (
    <span className={styles.score} data-size={size}>
      <span className={styles.value}>{percent}%</span>
      <span
        className={styles.track}
        role="meter"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        aria-label={label}
      >
        <span style={{ width: `${percent}%` }} />
      </span>
    </span>
  );
}
