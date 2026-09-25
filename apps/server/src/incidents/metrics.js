import { finite } from '../telemetry/prometheus.js';
import { serviceQueries } from '../topology/service.js';

const BEFORE_MS = 15 * 60_000;
const AFTER_MS = 5 * 60_000;
const TARGET_POINTS = 120;
export const CHART_METRICS = ['errorRatio', 'p95', 'rps', 'memory', 'saturation'];

// The series behind an incident's charts: every service, from a little before the incident
// started until a little after it ended (or now). The queries are fixed server-side, so
// the browser never sends raw PromQL.
export async function incidentMetrics(prometheus, namespace, incident) {
  const start = new Date(incident.startedAt.getTime() - BEFORE_MS);
  const end = new Date(Math.min(Date.now(), (incident.resolvedAt?.getTime() ?? Date.now()) + AFTER_MS));
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
