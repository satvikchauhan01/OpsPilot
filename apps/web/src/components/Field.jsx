import styles from './Field.module.css';

// A labelled form control. The control itself (input, select, textarea) is the child, and
// gets the console's look from here.
export function Field({ label, hint, grow = false, children }) {
  return (
    <label className={styles.field} data-grow={grow || undefined}>
      <span className={styles.label}>{label}</span>
      {children}
      {hint && <span className={styles.hint}>{hint}</span>}
    </label>
  );
}
