import { Alert } from '../models/alert.js';
import { Change } from '../models/change.js';
import { Incident } from '../models/incident.js';
import { nextSequence } from '../models/counter.js';
import { highestSeverity } from '../alerts/severity.js';
import { normalizeAlert } from '../alerts/normalize.js';
import { HttpError, notFound } from '../http/errors.js';
import { bus } from '../realtime/bus.js';
import { logger } from '../logger.js';
import { createSerialQueue } from '../lib/serial-queue.js';
import { suspectService } from '../topology/graph.js';
import { findIncidentForAlert } from './correlation.js';
import { canTransition } from './status.js';
import { incidentTitle } from './title.js';
import { buildTimeline } from './timeline.js';

// How far before an incident the timeline looks for things that might have caused it.
// Deliberate changes (deploys, scaling, config) can take a while to bite. Runtime symptoms
// (warnings, container restarts) only matter close to the incident itself.
const CHANGE_LOOKBACK_MS = 30 * 60_000;
const SYMPTOM_LOOKBACK_MS = 5 * 60_000;
const SYMPTOM_KINDS = ['warning', 'pod_restart'];

export function createIncidentService({ topology, config }) {
  // Alertmanager sends separate requests per alert group, often at the same moment.
  // Handling them one at a time keeps two related alerts from both opening an incident.
  const enqueue = createSerialQueue();

  async function ingest(payload) {
    return enqueue(async () => {
      const summary = { received: payload.alerts.length, opened: 0, joined: 0, repeated: 0, resolved: 0 };
      for (const raw of payload.alerts) {
        const alert = normalizeAlert(raw);
        if (alert.status === 'firing') summary[await onFiring(alert)] += 1;
        else if (await onResolved(alert)) summary.resolved += 1;
      }
      return summary;
    });
  }

  async function onFiring(alert) {
    const known = await Alert.findOne({ fingerprint: alert.fingerprint, startsAt: alert.startsAt });
    if (known) {
      // Alertmanager repeats firing alerts. Nothing new unless the alert had been resolved.
      if (known.status === 'resolved') {
        known.set({ status: 'firing', endsAt: null });
        await known.save();
        await refreshIncident(known.incident);
      }
      return 'repeated';
    }

    const open = await Incident.find({ status: { $ne: 'resolved' } }).sort({ lastAlertAt: -1 });
    const match = findIncidentForAlert(alert, open, topology.graph(), { windowMs: config.correlationWindowMs });

    if (match) {
      await Alert.create({ ...alert, incident: match._id });
      match.history.push({ type: 'alert', note: `${alert.name} on ${alert.service}` });
      await refreshIncident(match._id, match);
      logger.info({ incident: match.number, alert: alert.name, service: alert.service }, 'alert joined incident');
      return 'joined';
    }

    const incident = await Incident.create({
      number: await nextSequence('incident'),
      title: incidentTitle([alert], alert.service),
      severity: alert.severity,
      services: [alert.service],
      suspectedService: alert.service,
      startedAt: alert.startsAt,
      lastAlertAt: alert.startsAt,
      history: [{ type: 'opened', note: `${alert.name} on ${alert.service}` }],
    });
    await Alert.create({ ...alert, incident: incident._id });
    logger.info({ incident: incident.number, alert: alert.name, service: alert.service }, 'incident opened');
    bus.publish('incident.created', incident.toJSON());
    return 'opened';
  }

  async function onResolved(alert) {
    const stored = await Alert.findOneAndUpdate(
      { fingerprint: alert.fingerprint, startsAt: alert.startsAt, status: 'firing' },
      { status: 'resolved', endsAt: alert.endsAt ?? new Date() },
      { returnDocument: 'after' },
    );
    if (!stored) return false;
    await refreshIncident(stored.incident);
    return true;
  }

  // Recomputes everything derived from an incident's alerts: services, severity, suspect,
  // title, and whether all of its alerts are quiet now.
  async function refreshIncident(id, loaded) {
    const incident = loaded ?? (await Incident.findById(id));
    if (!incident || incident.status === 'resolved') return;

    const alerts = await Alert.find({ incident: incident._id }).sort({ startsAt: 1 });
    const firing = alerts.filter((alert) => alert.status === 'firing');
    const suspected = suspectService(topology.graph(), alerts) ?? incident.suspectedService;

    incident.set({
      services: [...new Set(alerts.map((alert) => alert.service))],
      severity: highestSeverity(alerts.map((alert) => alert.severity)),
      suspectedService: suspected,
      title: incidentTitle(alerts, suspected),
      lastAlertAt: alerts.at(-1)?.startsAt ?? incident.lastAlertAt,
      alertsResolvedAt: firing.length > 0 ? null : (incident.alertsResolvedAt ?? new Date()),
    });
    await incident.save();
    bus.publish('incident.updated', incident.toJSON());
  }

  async function changeStatus(number, to, { by, note }) {
    const incident = await findByNumber(number);
    if (incident.status === to) return incident;
    if (!canTransition(incident.status, to)) {
      throw new HttpError(409, `an incident can't go from ${incident.status} to ${to}`);
    }

    incident.history.push({ type: 'status', from: incident.status, to, by, note });
    incident.status = to;
    if (to === 'resolved') incident.resolvedAt = new Date();
    await incident.save();
    bus.publish('incident.updated', incident.toJSON());
    return incident;
  }

  // Incidents whose alerts have all been quiet for a while are over.
  async function resolveQuietIncidents() {
    const cutoff = new Date(Date.now() - config.autoResolveMs);
    const quiet = await Incident.find({ status: { $ne: 'resolved' }, alertsResolvedAt: { $lte: cutoff } });
    for (const incident of quiet) {
      const minutes = Math.round(config.autoResolveMs / 60_000);
      await changeStatus(incident.number, 'resolved', {
        by: 'system',
        note: `all alerts quiet for ${minutes} minutes`,
      });
      logger.info({ incident: incident.number }, 'incident resolved automatically');
    }
  }

  // Safety net for missed "resolved" notifications: anything Alertmanager no longer has
  // as active is resolved here too.
  async function reconcile(activeFingerprints) {
    return enqueue(async () => {
      const grace = new Date(Date.now() - 2 * 60_000);
      const stale = await Alert.find({
        status: 'firing',
        fingerprint: { $nin: activeFingerprints },
        updatedAt: { $lte: grace },
      });
      for (const alert of stale) {
        alert.set({ status: 'resolved', endsAt: new Date() });
        await alert.save();
        await refreshIncident(alert.incident);
      }
      return stale.length;
    });
  }

  async function findByNumber(number) {
    const incident = await Incident.findOne({ number });
    if (!incident) throw notFound(`INC-${number}`);
    return incident;
  }

  async function list({ status, severity, service, limit = 50 }) {
    const filter = {};
    if (status === 'active') filter.status = { $ne: 'resolved' };
    else if (status) filter.status = status;
    if (severity) filter.severity = severity;
    if (service) filter.services = service;

    const incidents = await Incident.find(filter).sort({ startedAt: -1 }).limit(limit);
    const firing = await Alert.aggregate([
      { $match: { incident: { $in: incidents.map((incident) => incident._id) }, status: 'firing' } },
      { $group: { _id: '$incident', count: { $sum: 1 } } },
    ]);
    const firingCount = new Map(firing.map((row) => [String(row._id), row.count]));

    return incidents.map((incident) => {
      const { history, ...summary } = incident.toJSON();
      return { ...summary, firingAlerts: firingCount.get(incident.id) ?? 0 };
    });
  }

  async function get(number) {
    const incident = await findByNumber(number);
    const alerts = await Alert.find({ incident: incident._id }).sort({ startsAt: 1 });
    return { ...incident.toJSON(), alerts: alerts.map((alert) => alert.toJSON()) };
  }

  async function timeline(number, { investigations = [], actions = [] } = {}) {
    const incident = await findByNumber(number);
    const alerts = await Alert.find({ incident: incident._id });
    const end = incident.resolvedAt ?? new Date();
    const changes = await Change.find({
      namespace: config.kube.namespace,
      $or: [
        { kind: { $nin: SYMPTOM_KINDS }, at: { $gte: new Date(incident.startedAt - CHANGE_LOOKBACK_MS), $lte: end } },
        { kind: { $in: SYMPTOM_KINDS }, at: { $gte: new Date(incident.startedAt - SYMPTOM_LOOKBACK_MS), $lte: end } },
      ],
    })
      .sort({ at: 1 })
      .limit(500);

    return buildTimeline({ incident, alerts, changes, investigations, actions });
  }

  return { ingest, changeStatus, resolveQuietIncidents, reconcile, findByNumber, list, get, timeline };
}
