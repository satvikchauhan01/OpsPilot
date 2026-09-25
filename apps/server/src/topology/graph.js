import { compareSeverity } from '../alerts/severity.js';

// Nodes the collector's service graph invents: "user" stands for callers that aren't traced
// (the load generator), and "unknown" for calls whose other half never showed up.
const VIRTUAL_NODES = new Set(['user', 'unknown']);

export function buildGraph(edges) {
  const services = new Set();
  const downstream = new Map();
  const upstream = new Map();

  for (const { source, target } of edges) {
    if (VIRTUAL_NODES.has(source) || VIRTUAL_NODES.has(target) || source === target) continue;
    services.add(source);
    services.add(target);
    addEdge(downstream, source, target);
    addEdge(upstream, target, source);
  }
  return { services, downstream, upstream };
}

// Everything `service` calls, directly or through other services.
export function dependenciesOf(graph, service) {
  return walk(graph.downstream, service);
}

// Everything that calls `service`, directly or through other services.
export function dependentsOf(graph, service) {
  return walk(graph.upstream, service);
}

export function onSameCallPath(graph, a, b) {
  return a === b || dependenciesOf(graph, a).has(b) || dependentsOf(graph, a).has(b);
}

// Failures travel upstream: a broken dependency makes everything that calls it fail too.
// So among the alerting services, the likely origin is one whose own dependencies are all
// healthy. Ties go to the service that explains the most other alerts, then to the most
// severe and the earliest alert.
export function suspectService(graph, alerts) {
  const alerting = new Set(alerts.map((alert) => alert.service));
  const firstAlert = new Map();
  for (const alert of [...alerts].sort((a, b) => a.startsAt - b.startsAt || compareSeverity(a.severity, b.severity))) {
    if (!firstAlert.has(alert.service)) firstAlert.set(alert.service, alert);
  }

  const explained = (service) => [...dependentsOf(graph, service)].filter((s) => alerting.has(s)).length;
  const candidates = [...alerting].filter(
    (service) => ![...dependenciesOf(graph, service)].some((dependency) => alerting.has(dependency)),
  );

  candidates.sort(
    (a, b) =>
      explained(b) - explained(a) ||
      compareSeverity(firstAlert.get(a).severity, firstAlert.get(b).severity) ||
      firstAlert.get(a).startsAt - firstAlert.get(b).startsAt,
  );
  return candidates[0] ?? null;
}

// The services a failure in `service` can reach: all of its direct and indirect callers.
export function blastRadius(graph, service) {
  return [...dependentsOf(graph, service)].sort();
}

function addEdge(adjacency, from, to) {
  if (!adjacency.has(from)) adjacency.set(from, new Set());
  adjacency.get(from).add(to);
}

function walk(adjacency, start) {
  const seen = new Set();
  const pending = [...(adjacency.get(start) ?? [])];
  while (pending.length > 0) {
    const next = pending.pop();
    if (next === start || seen.has(next)) continue;
    seen.add(next);
    pending.push(...(adjacency.get(next) ?? []));
  }
  return seen;
}
