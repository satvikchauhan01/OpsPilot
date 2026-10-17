import styles from './Kbd.module.css';

// A key on the keyboard, drawn like one.
export function Kbd({ children }) {
  return <kbd className={styles.key}>{children}</kbd>;
}
