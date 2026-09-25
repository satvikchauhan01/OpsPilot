// Shrinks raw telemetry into something a person (or a model) can read at a glance,
// without losing what matters for finding a root cause.

const MAX_GROUPS = 8;
const MAX_SPANS = 30;

// Log records that are "the same problem" (same message and exception) become one group
// with a count, first/last time and one example trace to follow.
export function groupLogs(records) {
  const groups = new Map();

  for (const { at, line, labels } of records) {
    const exception = labels.exception_type
      ? {
          type: labels.exception_type,
          message: labels.exception_message,
          where: firstAppFrame(labels.exception_stacktrace),
        }
      : null;
    const key = [labels.detected_level, line, exception?.type, exception?.message].join('|');

    const group = groups.get(key) ?? {
      count: 0,
      level: labels.detected_level ?? labels.severity_text ?? 'unknown',
      message: line,
      exception,
      firstAt: at,
      lastAt: at,
      versions: new Set(),
      pods: new Set(),
      exampleTraceId: labels.trace_id,
      request: labels.method && labels.path ? `${labels.method} ${labels.path}` : undefined,
    };
    group.count += 1;
    if (at < group.firstAt) group.firstAt = at;
    if (at > group.lastAt) group.lastAt = at;
    if (labels.service_version) group.versions.add(labels.service_version);
    if (labels.k8s_pod_name) group.pods.add(labels.k8s_pod_name);
    groups.set(key, group);
  }

  return [...groups.values()]
    .sort((a, b) => b.count - a.count)
    .slice(0, MAX_GROUPS)
    .map(({ versions, pods, ...group }) => ({
      ...group,
      firstAt: group.firstAt.toISOString(),
      lastAt: group.lastAt.toISOString(),
      versions: [...versions],
      pods: pods.size,
    }));
}

// "priceOrder (/app/src/checkout/pricing.js:23:40)": the first frame in our own code.
export function firstAppFrame(stack = '') {
  const frames = stack
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith('at '));
  const own = frames.find((frame) => !frame.includes('node:internal') && !frame.includes('node_modules'));
  return own?.slice(3);
}

// A trace as a flat list of spans in start order, keeping errors and the slowest spans
// when there are too many to show.
export function condenseTrace(trace) {
  const spans = [];
  for (const resourceSpans of trace?.resourceSpans ?? trace?.batches ?? []) {
    const service = attribute(resourceSpans.resource?.attributes, 'service.name');
    for (const scope of resourceSpans.scopeSpans ?? []) {
      for (const span of scope.spans ?? []) {
        const exception = span.events?.find((event) => event.name === 'exception');
        spans.push({
          service,
          name: span.name,
          start: Number(span.startTimeUnixNano) / 1e6,
          durationMs: round((Number(span.endTimeUnixNano) - Number(span.startTimeUnixNano)) / 1e6),
          error: span.status?.code === 'STATUS_CODE_ERROR' || span.status?.code === 2,
          message: span.status?.message || attribute(exception?.attributes, 'exception.message'),
          httpStatus:
            attribute(span.attributes, 'http.response.status_code') ?? attribute(span.attributes, 'http.status_code'),
        });
      }
    }
  }
  if (spans.length === 0) return null;

  const t0 = Math.min(...spans.map((span) => span.start));
  const end = Math.max(...spans.map((span) => span.start + span.durationMs));
  const important = [...spans]
    .sort((a, b) => Number(b.error) - Number(a.error) || b.durationMs - a.durationMs)
    .slice(0, MAX_SPANS);

  return {
    durationMs: round(end - t0),
    services: [...new Set(spans.map((span) => span.service))],
    errorSpans: spans.filter((span) => span.error).length,
    spans: important
      .sort((a, b) => a.start - b.start)
      .map(({ start, ...span }) => ({ ...span, offsetMs: round(start - t0), message: span.message || undefined })),
  };
}

function attribute(attributes = [], key) {
  const value = attributes.find((attr) => attr.key === key)?.value;
  if (!value) return undefined;
  return value.stringValue ?? value.intValue ?? value.doubleValue ?? value.boolValue;
}

function round(value) {
  return Math.round(value * 10) / 10;
}
