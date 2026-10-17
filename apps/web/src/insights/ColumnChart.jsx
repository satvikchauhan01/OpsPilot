import { useState } from 'react';
import { scaleBand, scaleLinear } from 'd3-scale';
import { useElementWidth } from '../hooks/useElementWidth.js';
import { ChartFrame, LegendItem, Tooltip } from './ChartFrame.jsx';
import styles from './charts.module.css';

const HEIGHT = 180;
const MARGIN = { top: 12, right: 8, bottom: 24, left: 40 };
const MAX_BAR = 24;
const GAP = 2;
const LABEL_HALF_WIDTH = 22;

/**
 * Columns per day, stacked bottom-up in the order of `series` ({ key, label, tone, mark }).
 * A single series needs no legend: the title says what it is.
 * rows: [{ key, label, values: { [seriesKey]: number } }]
 */
export function ColumnChart({ title, rows, series, format = (value) => value }) {
  const [ref, width] = useElementWidth();
  const [hovered, setHovered] = useState(null);
  const innerWidth = Math.max(0, width - MARGIN.left - MARGIN.right);
  const innerHeight = HEIGHT - MARGIN.top - MARGIN.bottom;

  const total = (row) => series.reduce((sum, entry) => sum + (row.values[entry.key] ?? 0), 0);
  const x = scaleBand()
    .domain(rows.map((row) => row.key))
    .range([0, innerWidth])
    .paddingInner(0.3);
  const y = scaleLinear()
    .domain([0, Math.max(1, ...rows.map(total))])
    .nice(4)
    .range([innerHeight, 0]);
  const barWidth = Math.min(MAX_BAR, x.bandwidth());
  const labelEvery = Math.max(1, Math.ceil(rows.length / Math.max(2, Math.floor(innerWidth / 64))));
  const active = hovered !== null ? rows[hovered] : null;

  const table = (
    <table>
      <thead>
        <tr>
          <th scope="col">Day (UTC)</th>
          {series.map((entry) => (
            <th key={entry.key} scope="col">
              {entry.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows
          .filter((row) => total(row) > 0)
          .map((row) => (
            <tr key={row.key}>
              <th scope="row">{row.label}</th>
              {series.map((entry) => (
                <td key={entry.key}>{format(row.values[entry.key] ?? 0)}</td>
              ))}
            </tr>
          ))}
      </tbody>
    </table>
  );

  return (
    <ChartFrame
      title={title}
      legend={
        series.length > 1 &&
        series.map((entry) => (
          <LegendItem key={entry.key} mark={entry.mark}>
            {entry.label}
          </LegendItem>
        ))
      }
      table={table}
    >
      <div ref={ref} className={styles.plot} style={{ height: HEIGHT }}>
        {width > 0 && (
          <svg width={width} height={HEIGHT} role="img" aria-label={title}>
            <g transform={`translate(${MARGIN.left},${MARGIN.top})`}>
              {y.ticks(4).map((tick) => (
                <g key={tick} transform={`translate(0,${y(tick)})`}>
                  <line className={tick === 0 ? styles.baseline : styles.grid} x2={innerWidth} />
                  <text className={styles.tickY} x={-8} dy="0.32em">
                    {format(tick)}
                  </text>
                </g>
              ))}
              {rows.map((row, index) =>
                // Every few days, and never so close to the right edge that the date is cut off
                index % labelEvery === 0 &&
                x(row.key) + x.bandwidth() / 2 + LABEL_HALF_WIDTH <= innerWidth + MARGIN.right ? (
                  <text key={row.key} className={styles.tickX} x={x(row.key) + x.bandwidth() / 2} y={innerHeight + 16}>
                    {row.label}
                  </text>
                ) : null,
              )}

              {rows.map((row, index) => {
                const left = x(row.key) + (x.bandwidth() - barWidth) / 2;
                const filled = series.filter((entry) => (row.values[entry.key] ?? 0) > 0);
                let base = innerHeight;
                return (
                  <g key={row.key} data-dimmed={hovered !== null && hovered !== index ? true : undefined}>
                    {filled.map((entry, i) => {
                      const height = innerHeight - y(row.values[entry.key]);
                      const path = column(left, base, barWidth, height, i === filled.length - 1);
                      base -= height + GAP;
                      return <path key={entry.key} className={styles[entry.tone]} d={path} />;
                    })}
                    <rect
                      className={styles.hit}
                      x={x(row.key) - (x.step() - x.bandwidth()) / 2}
                      width={x.step()}
                      height={innerHeight}
                      onPointerEnter={() => setHovered(index)}
                      onPointerLeave={() => setHovered(null)}
                    />
                  </g>
                );
              })}
            </g>
          </svg>
        )}
        {active && (
          <Tooltip
            x={MARGIN.left + x(active.key) + x.bandwidth() / 2}
            y={MARGIN.top + innerHeight / 2}
            flip={x(active.key) > innerWidth * 0.6}
          >
            <strong>{active.label}</strong>
            {series.map((entry) => (
              <span key={entry.key} className={styles.row}>
                {entry.mark} {format(active.values[entry.key] ?? 0)} {entry.label}
              </span>
            ))}
          </Tooltip>
        )}
      </div>
    </ChartFrame>
  );
}

// A column segment standing on `base`: square where it sits, rounded at its free end.
function column(left, base, width, height, roundTop) {
  if (height <= 0) return '';
  const r = roundTop ? Math.min(4, width / 2, height) : 0;
  const top = base - height;
  return [
    `M${left},${base}`,
    `V${top + r}`,
    r ? `Q${left},${top} ${left + r},${top}` : '',
    `H${left + width - r}`,
    r ? `Q${left + width},${top} ${left + width},${top + r}` : '',
    `V${base}`,
    'Z',
  ].join(' ');
}
