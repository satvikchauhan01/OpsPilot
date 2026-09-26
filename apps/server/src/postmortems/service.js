import { Postmortem } from '../models/postmortem.js';
import { Incident } from '../models/incident.js';
import { Investigation } from '../models/investigation.js';
import { HttpError, notFound } from '../http/errors.js';
import { bus } from '../realtime/bus.js';
import { logger } from '../logger.js';
import { createSerialQueue } from '../lib/serial-queue.js';
import { LlmOverloadedError } from '../llm/gemini.js';
import { serviceQueries } from '../topology/service.js';
import { describeAction, describeDone } from '../remediation/catalog.js';
import { NARRATIVE_PARAMETERS, composePostmortem, parseNarrative, templateNarrative } from './document.js';

const SUBMIT = {
  name: 'submit_postmortem',
  description: 'Submit the written parts of the postmortem.',
  parametersJsonSchema: NARRATIVE_PARAMETERS,
};

const SYSTEM = `You write blameless postmortems for the engineers who run an online shop on Kubernetes.
Use only the facts you are given: never invent times, numbers, people, versions or causes. If a fact is missing, say it is unknown.
Write plainly and briefly, for engineers. Name what went wrong in the system, never who.
Action items must be specific to this incident (e.g. "add a test for expired coupon codes"), not general advice.
Call submit_postmortem once with your text.`;

// Timeline entries worth a line in a postmortem: what changed, what alerted, what people and
// OpsPilot did. Rollout progress and repeated Kubernetes warnings are left to the incident page,
// and so are changes from before the incident, unless they are recent enough to be its cause
// and touched one of its services.
const TIMELINE_KINDS = new Set(['change', 'alert', 'incident', 'investigation', 'action']);
const LEAD_UP_MS = 15 * 60_000;
const MAX_TIMELINE = 40;

function belongsInPostmortem(entry, incident) {
  if (!TIMELINE_KINDS.has(entry.kind) || entry.subkind === 'rollout') return false;
  if (entry.kind !== 'change') return true;
  const lead = incident.startedAt - new Date(entry.at);
  return lead <= 0 || (lead <= LEAD_UP_MS && incident.services.includes(entry.service));
}

export function createPostmortemService({ llm, prometheus, incidents, investigations, remediation, config }) {
  const enqueue = createSerialQueue();

  function publish(postmortem) {
    bus.publish('postmortem.updated', { incidentNumber: postmortem.incidentNumber, status: postmortem.status });
  }

  // Everything factual about a resolved incident, in the shape the document and the model use.
  async function factsOf(incident) {
    const [history, actions, investigation] = await Promise.all([
      investigations.forIncident(incident._id),
      remediation.forIncident(incident._id),
      Investigation.findOne({ incident: incident._id, status: 'completed' }).sort({ createdAt: -1 }).lean(),
    ]);
    const timeline = await incidents.timeline(incident.number, { investigations: history, actions });
    const top = investigation?.result?.hypotheses?.[0];
    const verified = actions.findLast((action) => action.status === 'verified');

    return {
      id: `INC-${String(incident.number).padStart(3, '0')}`,
      title: incident.title,
      severity: incident.severity,
      services: incident.services,
      origin: incident.suspectedService,
      startedAt: isoSeconds(incident.startedAt),
      resolvedAt: isoSeconds(incident.resolvedAt),
      duration: durationText(incident.resolvedAt - incident.startedAt),
      peaks: await peaksOf(incident).catch(() => []),
      rootCause: top
        ? { service: top.service, causeType: top.causeType, title: top.title, confidence: top.confidence }
        : null,
      investigationSummary: investigation?.result?.summary,
      evidence: top?.evidence.map((item) => item.finding) ?? [],
      fix: verified ? `${describeDone(verified)}, approved by ${verified.decidedBy} and verified` : null,
      attempts: actions
        .filter((action) => !['superseded', 'cancelled'].includes(action.status))
        .map((action) => `${describeAction(action)}: ${action.status}${action.error ? ` (${action.error})` : ''}`),
      timeline: timeline
        .filter((entry) => belongsInPostmortem(entry, incident))
        .slice(0, MAX_TIMELINE)
        .map((entry) => ({ time: isoSeconds(entry.at).slice(11), text: entry.title })),
    };
  }

  // The worst error rate and p95 latency each service reached while the incident lasted.
  async function peaksOf(incident) {
    const range = Math.max(60, Math.round((incident.resolvedAt - incident.startedAt) / 1000));
    const queries = serviceQueries(config.kube.namespace, '1m');
    const [errors, latency] = await Promise.all(
      [queries.errorRatio, queries.p95].map((query) =>
        prometheus.query(`max_over_time((${query})[${range}s:30s])`, incident.resolvedAt),
      ),
    );
    const p95 = new Map(latency.map(({ labels, value }) => [labels.service, value]));
    return errors
      .filter(({ labels }) => incident.services.includes(labels.service))
      .map(({ labels, value }) => ({
        service: labels.service,
        errorRate: Number.isFinite(value) ? value : 0,
        p95: Number.isFinite(p95.get(labels.service)) ? p95.get(labels.service) : null,
      }));
  }

  // One model call, on the backup model when the main one is overloaded. Returns null when no
  // model can write it, and the caller falls back to the template.
  async function writeNarrative(facts) {
    const request = {
      system: SYSTEM,
      contents: [{ role: 'user', parts: [{ text: `The incident, as data:\n${JSON.stringify(facts, null, 1)}` }] }],
      tools: [SUBMIT],
      allowedTools: [SUBMIT.name],
    };
    let model = llm.pickModel();
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      let reply;
      try {
        reply = await llm.generate({ ...request, model });
      } catch (err) {
        if (err instanceof LlmOverloadedError && llm.fallbackModel && model !== llm.fallbackModel) {
          model = llm.fallbackModel;
          continue;
        }
        throw err;
      }
      const call = reply.calls.find((candidate) => candidate.name === SUBMIT.name);
      const parsed = parseNarrative(call?.args);
      if (parsed.ok) return { narrative: parsed.narrative, model };
      logger.warn({ incident: facts.id, err: parsed.error }, 'the model wrote an invalid postmortem');
    }
    return null;
  }

  // What a draft consists of: the facts, the model's text around them (or the template's) and
  // who wrote it.
  async function writeDraft(incident) {
    const facts = await factsOf(incident);
    let written = null;
    let note;
    if (llm) {
      written = await writeNarrative(facts).catch((err) => {
        note = `the AI could not write it: ${err.message}`;
        return null;
      });
    } else {
      note = 'AI writing is off (no GEMINI_API_KEY)';
    }
    const draftedBy = written ? `OpsPilot AI (${written.model})` : 'OpsPilot, from a template';

    return {
      status: 'draft',
      markdown: composePostmortem(facts, written?.narrative ?? templateNarrative(facts), { draftedBy }),
      draftedBy,
      draftNote: written ? undefined : (note ?? 'the AI answer was not valid, twice'),
      draftedAt: new Date(),
      editedBy: undefined,
      editedAt: undefined,
    };
  }

  async function draft(incident, postmortem) {
    try {
      postmortem.set(await writeDraft(incident));
      logger.info({ incident: incident.number, by: postmortem.draftedBy }, 'postmortem drafted');
    } catch (err) {
      // A draft written earlier stays as it was
      logger.warn({ incident: incident.number, err: err.message }, 'could not draft the postmortem');
      postmortem.set({
        status: postmortem.markdown ? 'draft' : 'failed',
        draftNote: `could not write it: ${err.message}`,
      });
    }
    await postmortem.save();
    publish(postmortem);
  }

  // Marks the postmortem as being written straight away, so every open page shows it, then
  // writes it in the background, one at a time.
  async function queueDraft(incident) {
    const postmortem = await Postmortem.findOneAndUpdate(
      { incident: incident._id },
      { $setOnInsert: { incidentNumber: incident.number }, status: 'drafting' },
      { upsert: true, returnDocument: 'after' },
    );
    publish(postmortem);
    enqueue(() => draft(incident, postmortem)).catch((err) => {
      logger.warn({ incident: incident.number, err: err.message }, 'could not save the postmortem');
    });
  }

  // Every incident gets a draft as it is resolved. Older incidents get one on request.
  function start() {
    bus.on('event', ({ type, data }) => {
      if (type !== 'incident.updated' || data.status !== 'resolved') return;
      draftFirst(data.number).catch((err) => {
        logger.warn({ incident: data.number, err: err.message }, 'could not start the postmortem');
      });
    });
  }

  async function draftFirst(number) {
    const incident = await Incident.findOne({ number });
    if (incident && !(await Postmortem.exists({ incident: incident._id }))) await queueDraft(incident);
  }

  // Drafts that a restart cut short are written again.
  async function redraftInterrupted() {
    const interrupted = await Postmortem.find({ status: 'drafting' });
    for (const { incident: id } of interrupted) {
      const incident = await Incident.findById(id);
      if (incident) await queueDraft(incident);
    }
  }

  async function find(number, { allowMissing = false } = {}) {
    const postmortem = await Postmortem.findOne({ incidentNumber: number });
    if (!postmortem && !allowMissing) throw notFound('postmortem');
    return postmortem;
  }

  async function get(number) {
    return (await find(number)).toJSON();
  }

  // Writes the draft again, replacing edits. Final postmortems stay as they are.
  async function redraft(number) {
    const incident = await incidents.findByNumber(number);
    if (incident.status !== 'resolved')
      throw new HttpError(409, 'postmortems are written once the incident is resolved');
    const current = await find(number, { allowMissing: true });
    if (current?.status === 'final') throw new HttpError(409, 'this postmortem is final');
    if (current?.status === 'drafting') throw new HttpError(409, 'the postmortem is already being written');
    await queueDraft(incident);
  }

  async function save(number, { markdown, by }) {
    const postmortem = await find(number);
    if (postmortem.status !== 'draft') throw new HttpError(409, `this postmortem is ${postmortem.status}`);
    postmortem.set({ markdown, editedBy: by, editedAt: new Date() });
    await postmortem.save();
    publish(postmortem);
    return postmortem.toJSON();
  }

  async function finalize(number, { by }) {
    const postmortem = await find(number);
    if (postmortem.status !== 'draft') throw new HttpError(409, `this postmortem is ${postmortem.status}`);
    postmortem.set({ status: 'final', finalizedBy: by, finalizedAt: new Date() });
    await postmortem.save();
    publish(postmortem);
    return postmortem.toJSON();
  }

  return { start, redraftInterrupted, get, redraft, save, finalize };
}

function isoSeconds(date) {
  return new Date(date).toISOString().slice(0, 19).replace('T', ' ');
}

function durationText(ms) {
  const minutes = Math.max(1, Math.round(ms / 60_000));
  return minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)} h ${minutes % 60} min`;
}
