import { Alert } from '../models/alert.js';
import { Change } from '../models/change.js';
import { Investigation } from '../models/investigation.js';
import { netChanges } from '../changes/diff.js';
import { describeIncident } from './incident-text.js';

// Changes someone made on purpose: releases, settings, scaling and restarts. They can explain
// an incident when they come shortly before it, and they are the fix when they come during it.
export const DELIBERATE_CHANGES = ['deploy', 'config', 'scale', 'restart'];

const LOOKBACK_MS = 30 * 60_000;

// What the knowledge features need to know about an incident: its alerts, what changed in the
// half hour before it on the service where it starts, and the root cause from its latest
// finished investigation. Changes elsewhere are left out, by the same rule the investigator
// follows: a change is only a suspect on the service where the symptoms begin.
export async function incidentContext(incident, namespace) {
  const origin = incident.suspectedService ? [incident.suspectedService] : incident.services;
  const [alerts, recentChanges, investigation] = await Promise.all([
    Alert.find({ incident: incident._id }, 'name service severity startsAt').sort({ startsAt: 1 }).lean(),
    deliberateChanges(namespace, origin, {
      from: new Date(incident.startedAt.getTime() - LOOKBACK_MS),
      to: incident.startedAt,
    }),
    Investigation.findOne({ incident: incident._id, status: 'completed' }, 'result').sort({ createdAt: -1 }).lean(),
  ]);

  const top = investigation?.result?.hypotheses?.[0];
  return {
    alerts,
    changesBefore: recentChanges,
    rootCause: top
      ? { service: top.service, causeType: top.causeType, title: top.title, confidence: top.confidence }
      : null,
    summary: investigation?.result?.summary ?? null,
  };
}

// The incident in words, as a search for runbooks or similar incidents. An investigation
// searches without the root cause an earlier investigation found, so that a new one doesn't
// simply repeat the previous conclusion.
export async function incidentDescription(incident, namespace, { withRootCause }) {
  const { rootCause, ...context } = await incidentContext(incident, namespace);
  const cause = withRootCause ? rootCause : null;
  return {
    text: describeIncident({ ...context, rootCause: cause, suspectedService: incident.suspectedService }),
    rootCause: cause,
  };
}

// The net effect of the deliberate changes to `services` in a time window. A release that was
// rolled back inside the window changed nothing, and describing it would make unrelated
// incidents look alike.
export async function deliberateChanges(namespace, services, { from, to }) {
  const changes = await Change.find({
    namespace,
    service: { $in: services },
    kind: { $in: DELIBERATE_CHANGES },
    at: { $gt: from, $lte: to },
  })
    .sort({ at: 1 })
    .lean();
  return netChanges(changes);
}

export function servicesOf(incident) {
  return [...new Set([...incident.services, incident.suspectedService].filter(Boolean))];
}
