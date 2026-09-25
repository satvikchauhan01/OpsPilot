import { scaleLinear } from 'd3-scale';
import { line } from 'd3-shape';

// A tiny single-series trend with no axes. The label says what it shows, and the exact
// numbers sit next to it in the same row.
export function Sparkline({ points, color, label, width = 96, height = 26, max }) {
  const values = points.filter(([, v]) => v !== null);
  if (values.length < 2) return <svg width={width} height={height} aria-hidden="true" />;

  const x = scaleLinear()
    .domain([points[0][0], points.at(-1)[0]])
    .range([1, width - 4]);
  const top = max ?? Math.max(...values.map(([, v]) => v));
  const y = scaleLinear()
    .domain([0, top || 1])
    .range([height - 3, 3]);
  const path = line()
    .defined(([, v]) => v !== null)
    .x(([t]) => x(t))
    .y(([, v]) => y(Math.min(v, top || 1)))(points);
  const [lastTime, lastValue] = values.at(-1);

  return (
    <svg width={width} height={height} role="img" aria-label={label}>
      <path d={path} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={x(lastTime)} cy={y(Math.min(lastValue, top || 1))} r="2.5" fill={color} />
    </svg>
  );
}
