// How each health metric is described and what counts as a notable change.
const HEALTH_METRICS = {
  rps: { label: 'requests', format: (v) => `${v.toFixed(1)}/s`, relative: true, notable: 0.25 },
  errorRatio: { label: 'errors', format: percentText, notable: 0.02 },
  p95: {
    label: 'p95',
    format: (v) => (v < 1 ? `${Math.round(v * 1000)} ms` : `${v.toFixed(2)} s`),
    relative: true,
    notable: 0.5,
  },
  memory: { label: 'memory of limit', format: percentText, notable: 0.15 },
  saturation: { label: 'processor connections busy', format: percentText, notable: 0.3 },
};

export function compare(metric, { before, now }) {
  const { label, format, relative, notable } = HEALTH_METRICS[metric];
  const has = (value) => Number.isFinite(value);
  if (!has(now) && !has(before)) return { text: `${label} no data`, notable: false };
  if (!has(before)) return { text: `${label} ${format(now)} (new)`, notable: true };
  if (!has(now)) return { text: `${label} ${format(before)} → no data`, notable: true };

  const change = relative ? (before === 0 ? (now === 0 ? 0 : Infinity) : (now - before) / before) : now - before;
  return {
    text: `${label} ${format(before)} → ${format(now)} (${describeChange(change, relative)})`,
    notable: Math.abs(change) >= notable,
  };
}

// "+525%", "-73.1 pts", or "0%" when nothing moved.
function describeChange(change, relative) {
  if (!Number.isFinite(change)) return 'up from zero';
  const rounded = relative ? Math.round(change * 100) : Math.round(change * 1000) / 10;
  const text = relative ? `${Math.abs(rounded)}%` : `${Math.abs(rounded).toFixed(1)} pts`;
  if (rounded === 0) return relative ? '0%' : '0.0 pts';
  return `${rounded > 0 ? '+' : '-'}${text}`;
}

function percentText(ratio) {
  return `${(ratio * 100).toFixed(ratio < 0.1 ? 1 : 0)}%`;
}
