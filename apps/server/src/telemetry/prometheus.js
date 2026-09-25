// Minimal Prometheus HTTP API client. Results come back as plain { labels, value } or
// { labels, points } objects, so callers never deal with Prometheus' string-encoded numbers.
export function createPrometheus(baseUrl) {
  async function request(path, params) {
    const url = new URL(path, baseUrl);
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null) url.searchParams.set(key, String(value));
    }

    const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
    const body = await res.json().catch(() => null);
    if (!body || body.status !== 'success') {
      throw new Error(`Prometheus query failed: ${body?.error ?? `HTTP ${res.status}`}`);
    }
    return body.data;
  }

  return {
    async query(expr, at) {
      const data = await request('/api/v1/query', { query: expr, time: at && toUnix(at) });
      return data.result.map(({ metric, value }) => ({ labels: metric, value: Number(value[1]) }));
    },

    async queryRange(expr, { start, end, stepSeconds }) {
      const data = await request('/api/v1/query_range', {
        query: expr,
        start: toUnix(start),
        end: toUnix(end),
        step: stepSeconds,
      });
      return data.result.map(({ metric, values }) => ({
        labels: metric,
        points: values.map(([t, v]) => [t * 1000, Number(v)]),
      }));
    },
  };
}

function toUnix(date) {
  return new Date(date).getTime() / 1000;
}

// NaN and ±Inf show up for ratios with a zero denominator. The UI treats them as "no data".
export function finite(value) {
  return Number.isFinite(value) ? value : null;
}
