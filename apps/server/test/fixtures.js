// The demo shop's call graph as the collector's service-graph connector reports it,
// including the virtual nodes it adds.
export const SHOP_EDGES = [
  { source: 'user', target: 'gateway' },
  { source: 'gateway', target: 'checkout' },
  { source: 'gateway', target: 'inventory' },
  { source: 'checkout', target: 'inventory' },
  { source: 'checkout', target: 'payments' },
  { source: 'gateway', target: 'unknown' },
];

const T0 = Date.parse('2026-09-25T12:00:00Z');

export function minutes(n) {
  return new Date(T0 + n * 60_000);
}

export function alert(service, name, { at = 0, severity = 'critical' } = {}) {
  return { service, name, severity, startsAt: minutes(at) };
}
