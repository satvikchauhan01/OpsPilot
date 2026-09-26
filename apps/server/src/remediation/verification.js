import { finite } from '../telemetry/prometheus.js';
import { serviceQueries } from '../topology/service.js';

// A fix holds when every service of the incident is back inside the limits the alert rules
// use (deploy/k8s/base/observability/prometheus/alerts.yml).
export const THRESHOLDS = {
  errorRatio: { max: 0.05, label: 'error rate' },
  p95: { max: 1, label: 'p95 latency' },
  memory: { max: 0.8, label: 'memory of limit' },
  saturation: { max: 0.9, label: 'processor connections busy' },
};

// The incident's service-level indicators right now, per service. One-minute rate windows,
// so a recovery shows up within the verification window instead of being averaged away.
export async function measure(prometheus, namespace, services, at) {
  const queries = serviceQueries(namespace, '1m');
  const metrics = Object.keys(THRESHOLDS);
  const results = await Promise.all(metrics.map((metric) => prometheus.query(queries[metric], at)));

  const values = Object.fromEntries(services.map((service) => [service, {}]));
  metrics.forEach((metric, i) => {
    for (const { labels, value } of results[i]) {
      if (values[labels.service]) values[labels.service][metric] = finite(value);
    }
  });
  return values;
}

/**
 * Decides a verification from its samples. Only samples taken from `judgeFrom` on count: the
 * start of the window gives the fix time to show. The fix holds when no judged sample has any
 * service over any threshold. A missing value (no traffic, no worker pool) doesn't count
 * against it, but a window without judged samples can't verify anything.
 */
export function judge(samples, { judgeFrom }) {
  const judged = samples.filter((sample) => new Date(sample.at) >= new Date(judgeFrom));
  if (judged.length === 0) return { outcome: 'failed', breaches: [], reason: 'no measurements in the window' };

  // The worst value per service and metric is enough to explain a failure.
  const worst = new Map();
  for (const sample of judged) {
    for (const [service, values] of Object.entries(sample.values)) {
      for (const [metric, { max }] of Object.entries(THRESHOLDS)) {
        const value = values[metric];
        if (value === null || value === undefined || value <= max) continue;
        const key = `${service} ${metric}`;
        if (!worst.has(key) || worst.get(key).value < value) worst.set(key, { service, metric, value, max });
      }
    }
  }

  const breaches = [...worst.values()];
  return breaches.length === 0
    ? { outcome: 'verified', breaches }
    : { outcome: 'failed', breaches, reason: breaches.map(describeBreach).join('; ') };
}

export function describeBreach({ service, metric, value, max }) {
  const format = metric === 'p95' ? (v) => `${v.toFixed(2)} s` : (v) => `${Math.round(v * 100)}%`;
  return `${service} ${THRESHOLDS[metric].label} ${format(value)} (limit ${format(max)})`;
}
