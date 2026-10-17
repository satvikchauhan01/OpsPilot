import { useState } from 'react';
import { useNavigate } from 'react-router';
import { scaleLinear, scaleTime } from 'd3-scale';
import { useElementWidth } from '../hooks/useElementWidth.js';
import { serviceColor } from '../lib/colors.js';
import { CAUSE_LABEL } from '../lib/labels.js';
import { dateTime, duration, incidentId, shortClock } from '../lib/format.js';
import { ChartFrame, LegendItem, Tooltip } from './ChartFrame.jsx';
import styles from './charts.module.css';

const HEIGHT = 220;
const MARGIN = { top: 14, right: 16, bottom: 26, left: 52 };
// The nearest incident within this distance answers the pointer, so small dots are easy to hit
const REACH_PX = 24;

const dayFormat = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short' });

/**
 * How long each resolved incident took, over time: one dot per incident, coloured by the
 * service it started at (the same colour that service has everywhere). Click a dot to open
 * the incident.
 */
export function DurationPlot({ incidents, window }) {
  const navigate = useNavigate();
  const [ref, width] = useElementWidth();
  const [hovered, setHovered] = useState(null);
  const innerWidth = Math.max(0, width - MARGIN.left - MARGIN.right);
  const innerHeight = HEIGHT - MARGIN.top - MARGIN.bottom;

  const points = incidents
    .filter((incident) => incident.toResolve !== null)
    .map((incident) => ({
      ...incident,
      at: new Date(incident.startedAt).getTime(),
      minutes: incident.toResolve / 60_000,
    }));
  const services = [...new Set(points.map((point) => point.service ?? 'unknown'))].sort();

  const x = scaleTime()
    .domain([new Date(window.since), new Date(window.until)])
    .range([0, innerWidth]);
  const y = scaleLinear()
    .domain([0, Math.max(1, ...points.map((point) => point.minutes))])
    .nice(4)
    .range([innerHeight, 0]);
  const active = hovered !== null ? points[hovered] : null;

  function nearest(event) {
    const bounds = event.currentTarget.getBoundingClientRect();
    const px = event.clientX - bounds.left;
    const py = event.clientY - bounds.top;
    let best = null;
    points.forEach((point, index) => {
      const distance = Math.hypot(x(point.at) - px, y(point.minutes) - py);
      if (distance <= REACH_PX && (!best || distance < best.distance)) best = { index, distance };
    });
    return best?.index ?? null;
  }

  const table = (
    <table>
      <thead>
        <tr>
          <th scope="col">Incident</th>
          <th scope="col">Started</th>
          <th scope="col">Origin</th>
          <th scope="col">Cause</th>
          <th scope="col">Lasted</th>
        </tr>
      </thead>
      <tbody>
        {[...points].reverse().map((point) => (
          <tr key={point.number}>
            <th scope="row">{incidentId(point.number)}</th>
            <td>{dateTime(point.startedAt)}</td>
            <td>{point.service ?? '—'}</td>
            <td>{CAUSE_LABEL[point.cause] ?? 'not investigated'}</td>
            <td>{duration(point.toResolve)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );

  return (
    <ChartFrame
      title="Time to resolve, per incident"
      legend={services.map((service) => (
        <LegendItem
          key={service}
          mark={<span className={styles.dotKey} style={{ background: serviceColor(service) }} />}
        >
          {service}
        </LegendItem>
      ))}
      table={table}
    >
      <div ref={ref} className={styles.plot} style={{ height: HEIGHT }}>
        {width > 0 && (
          <svg width={width} height={HEIGHT} role="img" aria-label="Time to resolve each incident, by start time">
            <g transform={`translate(${MARGIN.left},${MARGIN.top})`}>
              {y.ticks(4).map((tick) => (
                <g key={tick} transform={`translate(0,${y(tick)})`}>
                  <line className={tick === 0 ? styles.baseline : styles.grid} x2={innerWidth} />
                  <text className={styles.tickY} x={-8} dy="0.32em">
                    {tick} min
                  </text>
                </g>
              ))}
              {x.ticks(Math.max(2, Math.floor(innerWidth / 110))).map((tick) => (
                <text key={+tick} className={styles.tickX} x={x(tick)} y={innerHeight + 18}>
                  {window.days <= 2 ? shortClock(tick) : dayFormat.format(tick)}
                </text>
              ))}
              {points.map((point, index) => (
                <circle
                  key={point.number}
                  className={styles.dot}
                  data-active={index === hovered || undefined}
                  cx={x(point.at)}
                  cy={y(point.minutes)}
                  r={index === hovered ? 6 : 4.5}
                  style={{ fill: serviceColor(point.service ?? 'unknown') }}
                />
              ))}
              <rect
                className={styles.hit}
                width={innerWidth}
                height={innerHeight}
                style={{ cursor: hovered !== null ? 'pointer' : 'default' }}
                onPointerMove={(event) => setHovered(nearest(event))}
                onPointerLeave={() => setHovered(null)}
                onClick={() => active && navigate(`/incidents/${active.number}`)}
              />
            </g>
          </svg>
        )}
        {active && (
          <Tooltip
            x={MARGIN.left + x(active.at)}
            y={MARGIN.top + y(active.minutes)}
            flip={x(active.at) > innerWidth * 0.6}
          >
            <strong>
              {incidentId(active.number)} · {duration(active.toResolve)}
            </strong>
            <span>{active.title}</span>
            <span className={styles.muted}>
              {CAUSE_LABEL[active.cause] ?? 'not investigated'} · {dateTime(active.startedAt)}
            </span>
          </Tooltip>
        )}
      </div>
    </ChartFrame>
  );
}
