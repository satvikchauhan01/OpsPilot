// The alert rules' limits, so a service drawn red on a map is one an alert fires for.
export const LIMITS = { errorRatio: 0.05, p95: 1 };

// Health of each service from its own numbers, for maps of a past moment where the alert
// state isn't at hand.
export function nodeHealth(nodes) {
  return Object.fromEntries(
    nodes
      .filter((node) => node.kind !== 'external')
      .map((node) => [
        node.id,
        node.errorRatio > LIMITS.errorRatio ? 'critical' : node.p95 > LIMITS.p95 ? 'warning' : 'ok',
      ]),
  );
}
