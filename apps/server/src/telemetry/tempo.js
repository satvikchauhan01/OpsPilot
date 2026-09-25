// Minimal Tempo HTTP API client: TraceQL search and trace lookup.
export function createTempo(baseUrl) {
  async function get(path, params = {}) {
    const url = new URL(path, baseUrl);
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null) url.searchParams.set(key, String(value));
    }
    const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`Tempo request failed: HTTP ${res.status} ${await res.text().catch(() => '')}`.trim());
    return res.json();
  }

  return {
    async search(traceql, { start, end, limit = 10 }) {
      const data = await get('/api/search', {
        q: traceql,
        start: Math.floor(new Date(start) / 1000),
        end: Math.ceil(new Date(end) / 1000),
        limit,
      });
      return (data?.traces ?? []).map((trace) => ({
        traceId: trace.traceID,
        rootService: trace.rootServiceName,
        rootName: trace.rootTraceName,
        startedAt: new Date(Number(trace.startTimeUnixNano) / 1e6),
        durationMs: trace.durationMs ?? 0,
      }));
    },

    async trace(traceId) {
      const data = await get(`/api/v2/traces/${traceId}`);
      return data?.trace ?? data;
    },
  };
}
