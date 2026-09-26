import { alertWords, causeWords, sentence } from './text.js';

/**
 * Describes an incident in plain words: where it starts and what that service shows, which
 * other services are affected, what changed shortly before, and, once known, the root cause and
 * the fix. Incident memories and the searches that look them up are worded the same way, so
 * like matches like.
 *
 * Only the starting service's own symptoms are spelled out. The errors and slowness that spread
 * to its callers look the same in almost every incident, and listing them made unrelated
 * incidents look alike and buried the one symptom that tells them apart.
 */
export function describeIncident({ alerts, suspectedService, changesBefore = [], rootCause, fix }) {
  const origin = suspectedService ?? alerts[0]?.service;
  const own = unique(alerts.filter((alert) => alert.service === origin).map((alert) => alertWords(alert.name)));
  const others = unique(alerts.filter((alert) => alert.service !== origin).map((alert) => alert.service));

  const lines = [own.length > 0 ? `Starts in ${origin}: ${own.join(', ')}.` : `Starts in ${origin}.`];
  if (others.length > 0) lines.push(`Also affected: ${others.join(', ')}.`);
  if (changesBefore.length > 0) lines.push(`Changed shortly before: ${changesBefore.map(changeWords).join('; ')}.`);
  if (rootCause) {
    lines.push(`Root cause: ${causeWords(rootCause.causeType)} in ${rootCause.service}. ${sentence(rootCause.title)}`);
  }
  if (fix) lines.push(`Fixed by: ${sentence(fix)}`);
  return lines.join('\n');
}

// "deploy: checkout 1.4.1 → 1.4.2", "scale: payments scaled from 2 to 4 replicas"
export function changeWords(change) {
  return `${change.kind}: ${change.summary}`;
}

function unique(values) {
  return [...new Set(values)];
}
