import styles from './BarList.module.css';

/**
 * Horizontal bars as a plain list: a name, a bar, and the number at its tip, so every value
 * is readable without hovering. `color` gives a row its entity colour (a service);
 * without it the bars stay neutral. `segments` splits a bar into states, each a
 * { value, tone, label } in the order they stack.
 */
export function BarList({ rows, max, unit = '' }) {
  const top = max ?? Math.max(1, ...rows.map((row) => row.value));
  return (
    <ul className={styles.list}>
      {rows.map((row) => (
        <li key={row.name} className={styles.row}>
          <span className={styles.name}>{row.label ?? row.name}</span>
          <span className={styles.track}>
            {row.segments ? (
              row.segments
                .filter((segment) => segment.value > 0)
                .map((segment) => (
                  <span
                    key={segment.label}
                    className={styles.fill}
                    data-tone={segment.tone}
                    style={{ width: `${(segment.value / top) * 100}%` }}
                    title={`${segment.value} ${segment.label}`}
                  />
                ))
            ) : (
              <span className={styles.fill} style={{ width: `${(row.value / top) * 100}%`, background: row.color }} />
            )}
          </span>
          <span className={styles.value}>
            {row.value}
            {unit}
            {row.detail && <span className={styles.detail}>{row.detail}</span>}
          </span>
        </li>
      ))}
    </ul>
  );
}
