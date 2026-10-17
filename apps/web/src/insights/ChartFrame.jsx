import { useState } from 'react';
import styles from './ChartFrame.module.css';

/**
 * The frame every insights chart shares: a title, an optional legend, and a switch to a
 * table with the same numbers, so no value is only reachable by hovering.
 */
export function ChartFrame({ title, legend, table, children }) {
  const [showTable, setShowTable] = useState(false);
  return (
    <figure className={styles.frame}>
      <figcaption className={styles.caption}>
        <span className={styles.title}>{title}</span>
        {legend && <ul className={styles.legend}>{legend}</ul>}
        {table && (
          <button
            type="button"
            className={styles.toggle}
            aria-pressed={showTable}
            onClick={() => setShowTable((shown) => !shown)}
          >
            {showTable ? 'Chart' : 'Table'}
          </button>
        )}
      </figcaption>
      {showTable ? <div className={styles.table}>{table}</div> : children}
    </figure>
  );
}

// A legend entry: the mark carries the colour, the text stays in ink.
export function LegendItem({ children, mark }) {
  return (
    <li className={styles.item}>
      {mark}
      {children}
    </li>
  );
}

export function Tooltip({ x, y, flip, children }) {
  return (
    <div
      className={styles.tooltip}
      style={{ left: x, top: y, transform: flip ? 'translate(calc(-100% - 12px), -50%)' : 'translate(12px, -50%)' }}
      role="presentation"
    >
      {children}
    </div>
  );
}
