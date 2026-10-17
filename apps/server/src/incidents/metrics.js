import { serviceSeries } from '../services/metrics.js';

const BEFORE_MS = 15 * 60_000;
const AFTER_MS = 5 * 60_000;

// The series behind an incident's charts: every service, from a little before the incident
// started until a little after it ended (or now).
export function incidentMetrics(prometheus, namespace, incident) {
  const start = new Date(incident.startedAt.getTime() - BEFORE_MS);
  const end = new Date(Math.min(Date.now(), (incident.resolvedAt?.getTime() ?? Date.now()) + AFTER_MS));
  return serviceSeries(prometheus, namespace, { start, end });
}
