import styles from './Segmented.module.css';

// A row of mutually exclusive choices, for filters and ranges. `options` are
// { value, label, count? }; a count is shown next to its label.
export function Segmented({ label, options, value, onChange, size = 'md' }) {
  return (
    <div className={styles.segmented} role="group" aria-label={label} data-size={size}>
      {options.map((option) => (
        <button
          key={option.label}
          type="button"
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
        >
          {option.label}
          {option.count !== undefined && <span className={styles.count}>{option.count}</span>}
        </button>
      ))}
    </div>
  );
}
