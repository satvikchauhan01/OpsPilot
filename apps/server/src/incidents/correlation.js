import { onSameCallPath } from '../topology/graph.js';

// Picks the incident a new alert belongs to, or returns null when it should open a new one.
// `incidents` should be sorted newest first, so the most recent match wins.
//
// An alert joins an incident that is still joinable (see below) and that either already
// involves the alert's service or involves a service on the same call path in the dependency
// graph. For example, a gateway alert joins a payments incident because gateway calls
// payments through checkout. Two unrelated services never merge.
export function findIncidentForAlert(alert, incidents, graph, { windowMs }) {
  const joinable = incidents.filter((incident) => isJoinable(incident, alert.startsAt, windowMs));
  return (
    joinable.find((incident) => incident.services.includes(alert.service)) ??
    joinable.find((incident) => incident.services.some((service) => onSameCallPath(graph, service, alert.service))) ??
    null
  );
}

// An incident takes new alerts while any of its alerts is firing, and for one correlation
// window after its last activity, so a flapping alert rejoins it instead of opening a new one.
export function isJoinable(incident, at, windowMs) {
  if (incident.status === 'resolved') return false;
  if (!incident.alertsResolvedAt) return true;
  const lastActivity = Math.max(incident.lastAlertAt, incident.alertsResolvedAt);
  return at - lastActivity <= windowMs;
}
