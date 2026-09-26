import { Incident } from '../models/incident.js';
import { IncidentMemory } from '../models/incident-memory.js';
import { HttpError } from '../http/errors.js';
import { bus } from '../realtime/bus.js';
import { logger } from '../logger.js';
import { createSerialQueue } from '../lib/serial-queue.js';
import { embedOne } from './embeddings.js';
import { ensureVectorIndex, vectorSearch } from './vector-index.js';
import { describeIncident } from './incident-text.js';
import { deliberateChanges, incidentContext, incidentDescription, servicesOf } from './context.js';

const INDEX = 'incident_memory';
// Bump when the wording of memories changes: older ones are rewritten on the next start.
const MEMORY_VERSION = 6;
// Below this a past incident has too little in common with the current one to be worth showing.
// Measured on the demo scenarios: repeats score 0.76 to 0.95, look-alikes with another cause
// (payments slow in both) about 0.8, and unrelated incidents 0.57 at most.
const MIN_SIMILARITY = 0.65;

export function createMemoryService({ namespace }) {
  const enqueue = createSerialQueue();
  let ready = false;

  // Writes (or rewrites) the memory of a resolved incident.
  async function remember(number) {
    const incident = await Incident.findOne({ number });
    if (incident?.status !== 'resolved') return;

    const context = await incidentContext(incident, namespace);
    const fix = await fixOf(incident, context.rootCause);
    const text = describeIncident({ ...context, suspectedService: incident.suspectedService, fix: fix.summary });

    await IncidentMemory.replaceOne(
      { incident: incident._id },
      {
        incident: incident._id,
        incidentNumber: incident.number,
        title: incident.title,
        severity: incident.severity,
        services: incident.services,
        suspectedService: incident.suspectedService,
        startedAt: incident.startedAt,
        resolvedAt: incident.resolvedAt,
        symptoms: [...new Set(context.alerts.map((alert) => `${alert.name} on ${alert.service}`))],
        changesBefore: context.changesBefore.map((change) => change.summary),
        rootCause: context.rootCause,
        summary: context.summary,
        fix,
        text,
        embedding: await embedOne(text),
        version: MEMORY_VERSION,
      },
      { upsert: true },
    );
    logger.info({ incident: number }, 'incident remembered');
  }

  // What ended the incident: the net change to the services involved between its start and the
  // moment its alerts went quiet (a scale-down after that is tidying up, not the fix), or else
  // the note of whoever resolved it.
  async function fixOf(incident, rootCause) {
    const services = [...new Set([...servicesOf(incident), rootCause?.service].filter(Boolean))];
    const changes = await deliberateChanges(namespace, services, {
      from: incident.startedAt,
      to: incident.alertsResolvedAt ?? incident.resolvedAt,
    });
    const resolution = incident.history.findLast((entry) => entry.type === 'status' && entry.to === 'resolved');
    const by = resolution?.by ?? 'system';

    if (changes.length > 0) {
      const summaries = changes.map((change) => change.summary);
      return { summary: summaries.join('; '), changes: summaries, by };
    }
    if (resolution?.note && by !== 'system') return { summary: resolution.note, changes: [], by };
    return { summary: 'nothing was changed, the alerts cleared on their own', changes: [], by };
  }

  // Remembers incidents as they get resolved, and again when a later investigation of a
  // resolved incident finds its root cause.
  async function start() {
    await ensureVectorIndex(IncidentMemory, { name: INDEX, filters: ['startedAt'] });
    ready = true;

    const rememberQueued = (number) =>
      enqueue(() => remember(number)).catch((err) =>
        logger.warn({ incident: number, err: err.message }, 'could not remember the incident'),
      );

    bus.on('event', ({ type, data }) => {
      if (type === 'incident.updated' && data.status === 'resolved') rememberQueued(data.number);
      if (type === 'investigation.updated' && data.status === 'completed') rememberQueued(data.incidentNumber);
    });

    // Incidents resolved while OpsPilot was down, or remembered in an older wording.
    const current = await IncidentMemory.distinct('incidentNumber', { version: MEMORY_VERSION });
    const missing = await Incident.find({ status: 'resolved', number: { $nin: current } }, 'number')
      .sort({ number: 1 })
      .lean();
    for (const { number } of missing) await rememberQueued(number);
    return { remembered: missing.length };
  }

  // Up to `limit` incidents from before this one that looked like it, most similar first.
  async function similar(incident, { limit = 3, withRootCause = true } = {}) {
    if (!ready) throw new HttpError(503, 'incident memory is still starting up, try again in a moment');

    const { text } = await incidentDescription(incident, namespace, { withRootCause });
    const hits = await vectorSearch(IncidentMemory, {
      index: INDEX,
      vector: await embedOne(text),
      limit,
      filter: { startedAt: { $lt: incident.startedAt } },
    });

    return hits
      .filter((hit) => hit.similarity >= MIN_SIMILARITY)
      .map((hit) => ({
        number: hit.incidentNumber,
        title: hit.title,
        severity: hit.severity,
        services: hit.services,
        startedAt: hit.startedAt,
        resolvedAt: hit.resolvedAt,
        rootCause: hit.rootCause,
        summary: hit.summary,
        fix: hit.fix,
        similarity: hit.similarity,
      }));
  }

  return { start, similar };
}
