import { useId, useMemo, useState } from 'react';
import { scaleLinear, scaleTime } from 'd3-scale';
import { curveMonotoneX, line } from 'd3-shape';
import { bisector } from 'd3-array';
import { useElementWidth } from '../hooks/useElementWidth.js';
import { serviceColor } from '../lib/colors.js';
import { clock, shortClock } from '../lib/format.js';
import { useHoverTime } from './HoverTime.jsx';
import styles from './TimeSeriesChart.module.css';

const MARGIN = { top: 10, right: 16, bottom: 26, left: 52 };
const byTime = bisector((point) => point[0]).center;
const TABLE_ROWS = 24;

/**
 * Multi-series line chart over time.
 *
 * series:    [{ service, points: [[epochMs, value|null]] }]
 * domain:    [startMs, endMs]
 * format:    value -> string, used for the axis, tooltip and table
 * threshold: { value, label } drawn as a hairline, e.g. where the alert fires
 * markers:   [{ at, label }] vertical ticks, e.g. deploys
 * shade:     { from, to } highlighted span, e.g. the incident itself
 * emphasis:  services to draw at full strength, the rest recede
 */
export function TimeSeriesChart({
  title,
  series,
  domain,
  format,
  threshold,
  markers = [],
  shade,
  emphasis,
  height = 180,
}) {
  const [containerRef, width] = useElementWidth();
  const { time: hoverTime, setTime } = useHoverTime();
  const [showTable, setShowTable] = useState(false);
  const titleId = useId();
  const clipId = useId();

  const innerWidth = Math.max(0, width - MARGIN.left - MARGIN.right);
  const innerHeight = height - MARGIN.top - MARGIN.bottom;

  const { x, y, paths } = useMemo(() => {
    const x = scaleTime().domain(domain).range([0, innerWidth]);
    const peak = Math.max(0, ...series.flatMap(({ points }) => points.map(([, v]) => v ?? 0)));
    const y = scaleLinear()
      .domain([0, Math.max(peak, threshold?.value ?? 0) * 1.12 || 1])
      .nice(4)
      .range([innerHeight, 0]);
    const draw = line()
      .defined(([, v]) => v !== null)
      .x(([t]) => x(t))
      .y(([, v]) => y(v))
      .curve(curveMonotoneX);
    return { x, y, paths: series.map(({ service, points }) => ({ service, d: draw(points) })) };
  }, [series, domain, innerWidth, innerHeight, threshold]);

  const isEmphasized = (service) => !emphasis || emphasis.includes(service);
  const visibleMarkers = markers.filter((marker) => marker.at >= domain[0] && marker.at <= domain[1]);
  const hoverInRange = hoverTime !== null && hoverTime >= domain[0] && hoverTime <= domain[1];
  const readout = hoverInRange ? valuesAt(series, hoverTime) : null;
  const xTicks = x.ticks(Math.max(2, Math.floor(innerWidth / 110)));
  const yTicks = y.ticks(3);

  function pointerTime(event) {
    const bounds = event.currentTarget.getBoundingClientRect();
    return x.invert(event.clientX - bounds.left).getTime();
  }

  // Arrow keys step through the data one sample at a time, so the tooltip works without a mouse.
  function handleKey(event) {
    const times = series[0]?.points.map(([t]) => t) ?? [];
    if (times.length === 0 || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const current = hoverInRange ? byTime(series[0].points, hoverTime) : times.length - 1;
    const next = {
      ArrowLeft: Math.max(0, current - 1),
      ArrowRight: Math.min(times.length - 1, current + 1),
      Home: 0,
      End: times.length - 1,
    }[event.key];
    setTime(times[next]);
  }

  return (
    <figure className={styles.chart} aria-labelledby={titleId}>
      <figcaption className={styles.caption}>
        <span id={titleId} className={styles.title}>
          {title}
        </span>
        <ul className={styles.legend}>
          {series.map(({ service }) => (
            <li key={service} data-muted={!isEmphasized(service) || undefined}>
              <span className={styles.key} style={{ background: serviceColor(service) }} aria-hidden="true" />
              {service}
            </li>
          ))}
        </ul>
        <button
          type="button"
          className={styles.tableToggle}
          onClick={() => setShowTable((shown) => !shown)}
          aria-pressed={showTable}
        >
          {showTable ? 'Chart' : 'Table'}
        </button>
      </figcaption>

      {showTable ? (
        <DataTable series={series} format={format} />
      ) : (
        <div ref={containerRef} className={styles.plot} style={{ height }}>
          {width > 0 && (
            <svg width={width} height={height} role="img" aria-label={`${title}, ${series.length} services`}>
              <defs>
                {/* Marks stay inside the plot; a little headroom keeps line caps and marker tips whole */}
                <clipPath id={clipId}>
                  <rect x={-2} y={-8} width={innerWidth + 4} height={innerHeight + 10} />
                </clipPath>
              </defs>
              <g transform={`translate(${MARGIN.left},${MARGIN.top})`}>
                {shade && (
                  <rect
                    className={styles.shade}
                    x={x(Math.max(shade.from, domain[0]))}
                    width={Math.max(0, x(Math.min(shade.to, domain[1])) - x(Math.max(shade.from, domain[0])))}
                    height={innerHeight}
                  />
                )}

                {yTicks.map((tick) => (
                  <g key={tick} transform={`translate(0,${y(tick)})`}>
                    <line className={tick === 0 ? styles.baseline : styles.grid} x2={innerWidth} />
                    <text className={styles.tickY} x={-8} dy="0.32em">
                      {format(tick)}
                    </text>
                  </g>
                ))}
                {xTicks.map((tick) => (
                  <text key={+tick} className={styles.tickX} x={x(tick)} y={innerHeight + 18}>
                    {shortClock(tick)}
                  </text>
                ))}

                {threshold && (
                  <g transform={`translate(0,${y(threshold.value)})`}>
                    <line className={styles.threshold} x2={innerWidth} />
                    <text className={styles.thresholdLabel} x={innerWidth} dy="-4">
                      {threshold.label}
                    </text>
                  </g>
                )}

                <g clipPath={`url(#${clipId})`}>
                  {visibleMarkers.map((marker) => (
                    <g
                      key={`${marker.at}-${marker.label}`}
                      transform={`translate(${x(marker.at)},0)`}
                      className={styles.marker}
                    >
                      <line y2={innerHeight} />
                      <path d="M-4,-1 L4,-1 L0,5 Z" />
                      <title>{`${clock(marker.at)} · ${marker.label}`}</title>
                    </g>
                  ))}

                  {paths.map(({ service, d }) => (
                    <path
                      key={service}
                      d={d}
                      className={styles.line}
                      style={{ stroke: serviceColor(service), opacity: isEmphasized(service) ? 1 : 0.3 }}
                    />
                  ))}
                </g>

                {readout && (
                  <g transform={`translate(${x(readout.time)},0)`}>
                    <line className={styles.crosshair} y2={innerHeight} />
                    {readout.values.map(
                      ({ service, value }) =>
                        value !== null && (
                          <circle
                            key={service}
                            className={styles.dot}
                            cy={y(value)}
                            r={4}
                            style={{ fill: serviceColor(service) }}
                          />
                        ),
                    )}
                  </g>
                )}

                <rect
                  className={styles.hitArea}
                  width={innerWidth}
                  height={innerHeight}
                  tabIndex={0}
                  aria-label={`${title}: use the arrow keys to read values`}
                  onPointerMove={(event) => setTime(pointerTime(event))}
                  onPointerLeave={() => setTime(null)}
                  onKeyDown={handleKey}
                  onBlur={() => setTime(null)}
                />
              </g>
            </svg>
          )}

          {readout && (
            <Tooltip
              readout={readout}
              format={format}
              left={MARGIN.left + x(readout.time)}
              flip={x(readout.time) > innerWidth * 0.6}
            />
          )}
        </div>
      )}
    </figure>
  );
}

function valuesAt(series, time) {
  const reference = series.find(({ points }) => points.length > 0);
  if (!reference) return null;
  const snapped = reference.points[byTime(reference.points, time)][0];
  return {
    time: snapped,
    values: series.map(({ service, points }) => {
      const point = points[byTime(points, snapped)];
      return { service, value: point && Math.abs(point[0] - snapped) < 60_000 ? point[1] : null };
    }),
  };
}

// Values lead and names follow: the reader already knows which series, they want the number.
function Tooltip({ readout, format, left, flip }) {
  const rows = [...readout.values].sort((a, b) => (b.value ?? -1) - (a.value ?? -1));
  return (
    <div
      className={styles.tooltip}
      style={{ left, transform: flip ? 'translateX(calc(-100% - 12px))' : 'translateX(12px)' }}
    >
      <div className={styles.tooltipTime}>{clock(readout.time)}</div>
      {rows.map(({ service, value }) => (
        <div key={service} className={styles.tooltipRow}>
          <span className={styles.tooltipKey} style={{ background: serviceColor(service) }} />
          <strong>{value === null ? '—' : format(value)}</strong>
          <span>{service}</span>
        </div>
      ))}
    </div>
  );
}

function DataTable({ series, format }) {
  const times = series[0]?.points.map(([t]) => t) ?? [];
  const stride = Math.max(1, Math.ceil(times.length / TABLE_ROWS));
  const rows = times.filter((_, i) => i % stride === 0 || i === times.length - 1);

  return (
    <div className={styles.tableWrap}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th scope="col">Time</th>
            {series.map(({ service }) => (
              <th key={service} scope="col">
                {service}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((time) => (
            <tr key={time}>
              <th scope="row">{clock(time)}</th>
              {series.map(({ service, points }) => {
                const value = points.find(([t]) => t === time)?.[1] ?? null;
                return <td key={service}>{value === null ? '—' : format(value)}</td>;
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
