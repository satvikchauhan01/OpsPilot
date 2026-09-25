import styles from './States.module.css';

export function Loading({ label = 'Loading' }) {
  return (
    <div className={styles.loading} role="status">
      <span className={styles.bar} aria-hidden="true" />
      <span className="caption">{label}…</span>
    </div>
  );
}

export function Empty({ title, children }) {
  return (
    <div className={styles.empty}>
      <p className={styles.emptyTitle}>{title}</p>
      {children && <p className={styles.hint}>{children}</p>}
    </div>
  );
}

export function ErrorState({ error, onRetry }) {
  return (
    <div className={styles.error} role="alert">
      <p>
        <strong>Couldn't load this.</strong> {error?.message}
      </p>
      {onRetry && (
        <button type="button" className={styles.retry} onClick={onRetry}>
          Try again
        </button>
      )}
    </div>
  );
}

// Renders the right state for a react-query result, or the children once data is there.
export function QueryState({ query, loadingLabel, children }) {
  if (query.isPending) return <Loading label={loadingLabel} />;
  if (query.isError) return <ErrorState error={query.error} onRetry={() => query.refetch()} />;
  return children(query.data);
}

export function FullPageMessage({ title, detail, busy = false }) {
  return (
    <main className={styles.fullPage}>
      {busy && <span className={styles.bar} aria-hidden="true" />}
      <h1 className={styles.fullTitle}>{title}</h1>
      {detail && <p className={styles.hint}>{detail}</p>}
    </main>
  );
}
