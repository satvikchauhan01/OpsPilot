import styles from './PageHeader.module.css';

// The top of every page: which part of the console it belongs to, its name, one sentence on
// what it is for, and the page's own controls on the right.
export function PageHeader({ kicker, title, lede, actions, children }) {
  return (
    <header className={styles.header}>
      <div className={styles.text}>
        {kicker && <p className={styles.kicker}>{kicker}</p>}
        <h1 className={styles.title}>{title}</h1>
        {lede && <p className={styles.lede}>{lede}</p>}
      </div>
      {actions && <div className={styles.actions}>{actions}</div>}
      {children}
    </header>
  );
}
