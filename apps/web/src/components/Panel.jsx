import styles from './Panel.module.css';

export function Panel({ title, meta, actions, children, className = '', flush = false, id }) {
  const headingId = id ? `${id}-title` : undefined;
  return (
    <section className={`${styles.panel} ${className}`} aria-labelledby={headingId} id={id}>
      <header className={styles.header}>
        <h2 className={styles.title} id={headingId}>
          {title}
        </h2>
        {meta && <span className={styles.meta}>{meta}</span>}
        {actions && <div className={styles.actions}>{actions}</div>}
      </header>
      <div className={flush ? styles.flush : styles.body}>{children}</div>
    </section>
  );
}
