export const SEVERITIES = ['critical', 'warning', 'info'];

const RANK = { critical: 3, warning: 2, info: 1 };

export function highestSeverity(severities) {
  return severities.reduce((top, s) => ((RANK[s] ?? 0) > (RANK[top] ?? 0) ? s : top), 'info');
}

export function compareSeverity(a, b) {
  return (RANK[b] ?? 0) - (RANK[a] ?? 0);
}
