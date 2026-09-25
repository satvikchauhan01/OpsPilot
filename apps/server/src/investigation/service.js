import { Incident } from '../models/incident.js';
import { Investigation } from '../models/investigation.js';
import { HttpError, notFound } from '../http/errors.js';
import { bus } from '../realtime/bus.js';
import { logger } from '../logger.js';
import { createSerialQueue } from '../lib/serial-queue.js';
import { runInvestigation } from './investigator.js';

const FALLBACK_SERVICES = ['checkout', 'gateway', 'inventory', 'payments'];

export function createInvestigationService({ llm, telemetry, incidents, topology, tracker, config }) {
  // One investigation at a time: they share one rate-limited model quota.
  const enqueue = createSerialQueue();

  function knownServices() {
    const names = new Set([
      ...topology
        .snapshot()
        .nodes.filter((node) => node.kind === 'service')
        .map((node) => node.id),
      ...tracker.workloads().map((workload) => workload.name),
    ]);
    return names.size > 0 ? [...names].sort() : FALLBACK_SERVICES;
  }

  async function start(number, { trigger, requestedBy }) {
    if (!llm) throw new HttpError(503, 'AI investigation is off: set GEMINI_API_KEY to turn it on');

    const incident = await incidents.findByNumber(number);
    if (await Investigation.exists({ incident: incident._id, status: { $in: ['queued', 'running'] } })) {
      throw new HttpError(409, 'this incident is already being investigated');
    }

    const investigation = await Investigation.create({
      incident: incident._id,
      incidentNumber: number,
      trigger,
      requestedBy,
      status: 'queued',
    });
    bus.publish('investigation.updated', { incidentNumber: number, id: investigation.id, status: 'queued' });

    enqueue(async () => {
      let current = await Incident.findById(incident._id);
      if (current.status === 'open') {
        current = await incidents.changeStatus(number, 'investigating', {
          by: 'OpsPilot AI',
          note: 'automatic investigation started',
        });
      }
      await runInvestigation({ investigation, incident: current, llm, telemetry, services: knownServices() });
    }).catch((err) => logger.error({ err, incident: number }, 'investigation crashed'));

    return investigation;
  }

  // Every new incident is investigated automatically. The short wait lets related alerts
  // join the incident and gives the telemetry time to show the problem.
  function investigateNewIncidents() {
    if (!llm) return;
    bus.on('event', ({ type, data }) => {
      if (type !== 'incident.created') return;
      setTimeout(() => {
        start(data.number, { trigger: 'auto' }).catch((err) =>
          logger.warn({ incident: data.number, err: err.message }, 'could not start the automatic investigation'),
        );
      }, config.llm.investigationDelayMs);
    });
  }

  // Any investigation still marked running after a restart was cut off halfway.
  async function failInterrupted() {
    await Investigation.updateMany(
      { status: { $in: ['queued', 'running'] } },
      { status: 'failed', error: 'interrupted by a server restart', finishedAt: new Date() },
    );
  }

  async function forIncident(incidentId) {
    return Investigation.find({ incident: incidentId }, 'trigger status startedAt finishedAt result error')
      .sort({ createdAt: 1 })
      .lean()
      .then((rows) => rows.map((row) => ({ ...row, id: String(row._id) })));
  }

  async function list(number) {
    const investigations = await Investigation.find({ incidentNumber: number }, '-evidence -steps').sort({
      createdAt: -1,
    });
    return investigations.map((investigation) => investigation.toJSON());
  }

  async function get(number, id) {
    const investigation =
      id === 'latest'
        ? await Investigation.findOne({ incidentNumber: number }).sort({ createdAt: -1 })
        : await Investigation.findOne({ _id: id, incidentNumber: number }).catch(() => null);
    if (!investigation) throw notFound('investigation');
    return investigation.toJSON();
  }

  async function status() {
    return {
      enabled: Boolean(llm),
      model: llm?.model ?? null,
      remainingToday: llm ? await llm.remainingToday() : 0,
      dailyBudget: config.llm.dailyRequestBudget,
    };
  }

  return { start, investigateNewIncidents, failInterrupted, forIncident, list, get, status };
}
