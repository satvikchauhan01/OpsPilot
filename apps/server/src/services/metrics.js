import { finite } from '../telemetry/prometheus.js';
import { serviceQueries } from '../topology/service.js';

const CHART_METRICS = ['errorRatio', 'p95', 'rps', 'memory', 'saturation'];
const TARGET_POINTS = 120;

// Every chart metric for every service over a window, as { metric: [{ service, points }] }.
// The queries are fixed server-side, so the browser never sends raw PromQL.
export async function serviceSeries(prometheus, namespace, { start, end }) {
  const stepSeconds = Math.max(15, Math.round((end - start) / 1000 / TARGET_POINTS));
  const queries = serviceQueries(namespace, '1m');

  const results = await Promise.all(
    CHART_METRICS.map((metric) => prometheus.queryRange(queries[metric], { start, end, stepSeconds })),
  );

  const metrics = Object.fromEntries(
    CHART_METRICS.map((metric, i) => [
      metric,
      results[i]
        .filter(({ labels }) => labels.service)
        .map(({ labels, points }) => ({ service: labels.service, points: points.map(([t, v]) => [t, finite(v)]) }))
        .sort((a, b) => a.service.localeCompare(b.service)),
    ]),
  );

  return {
    window: { start: start.toISOString(), end: end.toISOString(), stepSeconds },
    metrics,
  };
}
