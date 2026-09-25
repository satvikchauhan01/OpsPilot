// Minimal Loki HTTP API client.
export function createLoki(baseUrl) {
  async function request(path, params) {
    const url = new URL(path, baseUrl);
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null) url.searchParams.set(key, String(value));
    }
    const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
    const body = await res.json().catch(() => null);
    if (!res.ok || body?.status !== 'success') {
      throw new Error(`Loki query failed: ${body?.error ?? body?.message ?? `HTTP ${res.status}`}`);
    }
    return body.data;
  }

  return {
    // Log lines, newest first, as { at, line, labels } where labels include structured metadata.
    async logs(query, { start, end, limit = 200 }) {
      const data = await request('/loki/api/v1/query_range', {
        query,
        start: toNanos(start),
        end: toNanos(end),
        limit,
        direction: 'backward',
      });
      return data.result
        .flatMap(({ stream, values }) =>
          values.map(([ns, line]) => ({ at: new Date(Number(ns) / 1e6), line, labels: stream })),
        )
        .sort((a, b) => b.at - a.at);
    },

    async metric(query, at = new Date()) {
      const data = await request('/loki/api/v1/query', { query, time: toNanos(at) });
      return data.result.map(({ metric, value }) => ({ labels: metric, value: Number(value[1]) }));
    },
  };
}

function toNanos(date) {
  return `${new Date(date).getTime()}000000`;
}
