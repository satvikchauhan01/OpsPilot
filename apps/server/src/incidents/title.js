import { compareSeverity } from '../alerts/severity.js';

// "HighLatency on payments, affecting checkout and gateway"
export function incidentTitle(alerts, suspectedService) {
  const origin = suspectedService ?? alerts[0]?.service ?? 'unknown';
  const names = unique(
    alerts
      .filter((alert) => alert.service === origin)
      .sort((a, b) => compareSeverity(a.severity, b.severity) || a.startsAt - b.startsAt)
      .map((alert) => alert.name),
  );
  const others = unique(alerts.map((alert) => alert.service))
    .filter((service) => service !== origin)
    .sort();

  const what = names.length > 2 ? `${names.slice(0, 2).join(', ')} and more` : names.join(' and ') || 'Alerts';
  return others.length > 0 ? `${what} on ${origin}, affecting ${joinWords(others)}` : `${what} on ${origin}`;
}

function unique(values) {
  return [...new Set(values)];
}

function joinWords(words) {
  return words.length <= 1 ? words.join('') : `${words.slice(0, -1).join(', ')} and ${words.at(-1)}`;
}
