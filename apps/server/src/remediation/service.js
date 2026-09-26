import { setTimeout as sleep } from 'node:timers/promises';
import { Action, ACTIVE_STATUSES } from '../models/action.js';
import { Incident } from '../models/incident.js';
import { Investigation } from '../models/investigation.js';
import { HttpError, notFound } from '../http/errors.js';
import { bus } from '../realtime/bus.js';
import { logger } from '../logger.js';
import { createSerialQueue } from '../lib/serial-queue.js';
import { MAX_REPLICAS, describeAction, parseAction } from './catalog.js';
import { PlanError } from './executor.js';
import { recommend } from './recommend.js';
import { THRESHOLDS, judge, measure } from './verification.js';

const AI = 'OpsPilot AI';
const SYSTEM = 'OpsPilot';
const SAMPLE_EVERY_MS = 20_000;
// Only the last minute of the verification window decides; the start gives the fix time to
// show in metrics that are averaged over a minute.
const JUDGED_MS = 60_000;

export function createRemediationService({ executor, prometheus, incidents, runbooks, audit, config }) {
  const namespace = config.kube.namespace;
  const windowMs = config.remediation.verificationWindowMs;
  // Deployments with a fix in flight. Two fixes never touch the same one at once.
  const busy = new Set();

  function status() {
    return {
      enabled: executor.enabled,
      reason: executor.enabled
        ? null
        : 'KUBE_EXECUTOR_TOKEN is not set. npm run cluster:up writes it; restart the server afterwards.',
      verificationWindowMinutes: windowMs / 60_000,
      thresholds: THRESHOLDS,
      maxReplicas: MAX_REPLICAS,
    };
  }

  function publish(action) {
    bus.publish('action.updated', { incidentNumber: action.incidentNumber, id: action.id, status: action.status });
  }

  function record(type, action, actor, data = {}) {
    return audit.append({
      type,
      actor,
      incidentNumber: action.incidentNumber,
      actionId: action.id,
      data: { action: action.type, params: action.params, ...data },
    });
  }

  async function moveIncident(number, to, { by, note }) {
    const incident = await Incident.findOne({ number }, 'status');
    if (!incident || incident.status === to || incident.status === 'resolved') return;
    await incidents
      .changeStatus(number, to, { by, note })
      .catch((err) => logger.warn({ incident: number, err: err.message }, 'could not change the incident status'));
  }

  async function findAction(id) {
    const action = await Action.findById(id).catch(() => null);
    if (!action) throw notFound('action');
    return action;
  }

  // Creates a proposal. Anything outside the catalog, or that can't be carried out on the
  // cluster as it is now, is refused before anyone gets to approve it.
  async function propose(number, input, { by, reason, source, runbook }) {
    const incident = await incidents.findByNumber(number);
    if (incident.status === 'resolved') throw new HttpError(409, 'this incident is resolved');
    const parsed = parseAction(input);
    if (!parsed.ok) throw new HttpError(400, parsed.error);
    if (await Action.exists({ incident: incident._id, status: { $in: ACTIVE_STATUSES } })) {
      throw new HttpError(409, 'a fix for this incident is already running');
    }

    let plan;
    try {
      plan = await executor.plan(parsed.action);
    } catch (err) {
      if (err instanceof PlanError) throw new HttpError(422, err.message);
      throw err;
    }

    const action = await Action.create({
      incident: incident._id,
      incidentNumber: number,
      ...parsed.action,
      plan,
      reason,
      source,
      runbook,
      proposedBy: by,
      proposedAt: new Date(),
    });
    await record('action.proposed', action, by, { plan: plan.summary, ...(reason && { reason }) });

    // Only the newest proposal waits for a decision.
    const older = await Action.find({ incident: incident._id, status: 'proposed', _id: { $ne: action._id } });
    for (const old of older) {
      old.status = 'superseded';
      await old.save();
      await record('action.superseded', old, SYSTEM, { supersededBy: action.id });
      publish(old);
    }
    publish(action);
    return action;
  }

  // Once an investigation has found the root cause, propose its fix. Nothing is proposed while
  // a fix is already running, or once the incident is over.
  async function proposeFromInvestigation(number) {
    const incident = await Incident.findOne({ number });
    if (!incident || incident.status === 'resolved') return;
    if (await Action.exists({ incident: incident._id, status: { $in: ACTIVE_STATUSES } })) return;

    const investigation = await Investigation.findOne({ incident: incident._id, status: 'completed' }).sort({
      createdAt: -1,
    });
    const top = investigation?.result?.hypotheses?.[0];
    if (!top) return;

    const guides = await runbooks.fixesFor(incident, top.causeType);
    const currentReplicas = await executor.replicasOf(top.service).catch(() => null);
    const recommendation = recommend(top, {
      runbookActions: [...new Set(guides.flatMap((guide) => guide.actions.map((step) => step.action)))],
      currentReplicas,
    });
    if (!recommendation) {
      logger.info({ incident: number, cause: top.causeType }, 'no automatic fix for this root cause');
      return;
    }

    const guide = guides.find((candidate) => candidate.actions.some((step) => step.action === recommendation.type));
    const step = guide?.actions.find((candidate) => candidate.action === recommendation.type);
    await propose(number, recommendation, {
      by: AI,
      reason: `${top.title} (${Math.round(top.confidence * 100)}% confidence)`,
      source: {
        kind: 'investigation',
        investigation: investigation._id,
        hypothesis: top.title,
        confidence: top.confidence,
        causeType: top.causeType,
      },
      runbook: guide ? { slug: guide.slug, title: guide.title, anchor: step.anchor, heading: step.heading } : undefined,
    });
  }

  async function approve(id, { by }) {
    if (!executor.enabled) throw new HttpError(503, `fixes can't run: ${status().reason}`);
    const action = await findAction(id);
    if (action.status !== 'proposed')
      throw new HttpError(409, `this fix is ${action.status}, not waiting for approval`);
    const service = action.params.service;
    if (busy.has(service)) throw new HttpError(409, `another fix is running on ${service}`);

    // Someone may have rolled back or scaled by hand since the proposal. A restart is still
    // a restart, but a stale rollback or scale would do something nobody approved.
    const current = await executor.plan(action).catch((err) => {
      throw new HttpError(409, err.message);
    });
    if (action.type !== 'restart' && current.summary !== action.plan.summary) {
      throw new HttpError(
        409,
        `${service} changed since this was proposed (now: ${current.summary}), propose it again`,
      );
    }

    const approved = await Action.findOneAndUpdate(
      { _id: action._id, status: 'proposed' },
      { status: 'approved', decidedBy: by, decidedAt: new Date() },
      { returnDocument: 'after' },
    );
    if (!approved) throw new HttpError(409, 'someone else decided on this fix first');

    busy.add(service);
    await record('action.approved', approved, by, { plan: approved.plan.summary });
    await moveIncident(approved.incidentNumber, 'mitigating', { by, note: `approved: ${describeAction(approved)}` });
    publish(approved);

    execute(approved, by)
      .catch((err) => logger.error({ err, action: approved.id }, 'running a fix crashed'))
      .finally(() => busy.delete(service));
    return approved;
  }

  async function reject(id, { by, reason }) {
    const action = await Action.findOneAndUpdate(
      { _id: id, status: 'proposed' },
      { status: 'rejected', decidedBy: by, decidedAt: new Date(), rejectionReason: reason },
      { returnDocument: 'after' },
    ).catch(() => null);
    if (!action) {
      const current = await findAction(id);
      throw new HttpError(409, `this fix is ${current.status}, not waiting for a decision`);
    }
    await record('action.rejected', action, by, { reason });
    publish(action);
    return action;
  }

  async function execute(action, approver) {
    const started = Date.now();
    try {
      action.set({ status: 'running', startedAt: new Date() });
      await action.save();
      publish(action);
      await record('action.started', action, SYSTEM, { plan: action.plan.summary });

      await executor.run(action, {
        cause: `OpsPilot INC-${action.incidentNumber}: ${describeAction(action)}, approved by ${approver}`,
      });
      await executor.waitForRollout(action.params.service, {
        onProgress: async (progress) => {
          if (JSON.stringify(progress) === JSON.stringify(action.rollout)) return;
          action.rollout = progress;
          await action.save();
          publish(action);
        },
      });

      action.set({ rolledOutAt: new Date() });
      await action.save();
      await record('action.rolled_out', action, SYSTEM, { seconds: Math.round((Date.now() - started) / 1000) });
    } catch (err) {
      await fail(action, 'execution', err.message);
      return;
    }
    await verify(action);
  }

  // Watches the incident's metrics for the verification window and decides whether the fix
  // brought them back inside their limits.
  async function verify(action) {
    const incident = await Incident.findOne({ number: action.incidentNumber }, 'services');
    const services = [...new Set([...(incident?.services ?? []), action.params.service])];
    const startedAt = new Date();
    const endsAt = new Date(startedAt.getTime() + windowMs);
    const judgeFrom = new Date(endsAt.getTime() - Math.min(JUDGED_MS, windowMs));

    action.set({ status: 'verifying', verification: { startedAt, endsAt, judgeFrom, services, samples: [] } });
    await action.save();
    publish(action);
    await record('action.verifying', action, SYSTEM, { services, until: endsAt.toISOString() });

    while (Date.now() < endsAt.getTime()) {
      await sleep(Math.min(SAMPLE_EVERY_MS, Math.max(0, endsAt.getTime() - Date.now())));
      try {
        action.verification.samples.push({ at: new Date(), values: await measure(prometheus, namespace, services) });
        await action.save();
        publish(action);
      } catch (err) {
        logger.warn({ action: action.id, err: err.message }, 'could not measure the incident during verification');
      }
    }

    const verdict = judge(action.verification.samples, { judgeFrom });
    action.verification.breaches = verdict.breaches;
    if (verdict.outcome !== 'verified') {
      await fail(action, 'verification', `the metrics did not recover: ${verdict.reason}`);
      return;
    }
    action.set({ status: 'verified', finishedAt: new Date() });
    await action.save();
    await record('action.verified', action, SYSTEM, { samples: action.verification.samples.length });
    publish(action);
  }

  // A failed fix hands the incident back to the investigators, except when it was cut off by a
  // restart, which says nothing about the fix itself.
  async function fail(action, stage, message) {
    action.set({ status: 'failed', failedStage: stage, error: message, finishedAt: new Date() });
    await action.save();
    await record('action.failed', action, SYSTEM, { stage, error: message });
    publish(action);
    if (stage !== 'interrupted') {
      await moveIncident(action.incidentNumber, 'investigating', { by: SYSTEM, note: `the fix failed: ${message}` });
    }
  }

  async function cancelOpenProposals(number) {
    const proposals = await Action.find({ incidentNumber: number, status: 'proposed' });
    for (const action of proposals) {
      action.status = 'cancelled';
      await action.save();
      await record('action.cancelled', action, SYSTEM, { reason: 'the incident was resolved' });
      publish(action);
    }
  }

  // Fixes that were running when the server stopped can't be followed up any more.
  async function failInterrupted() {
    for (const action of await Action.find({ status: { $in: ACTIVE_STATUSES } })) {
      await fail(action, 'interrupted', 'interrupted by a server restart');
    }
  }

  function start() {
    const enqueue = createSerialQueue();
    const queue = (job, number) =>
      enqueue(job).catch((err) => logger.warn({ incident: number, err: err.message }, 'remediation step failed'));

    bus.on('event', ({ type, data }) => {
      if (type === 'investigation.updated' && data.status === 'completed') {
        queue(() => proposeFromInvestigation(data.incidentNumber), data.incidentNumber);
      }
      if (type === 'incident.updated' && data.status === 'resolved') {
        queue(() => cancelOpenProposals(data.number), data.number);
      }
    });
  }

  async function list(number) {
    const actions = await Action.find({ incidentNumber: number }).sort({ proposedAt: -1 });
    return actions.map((action) => action.toJSON());
  }

  async function forIncident(incidentId) {
    return Action.find({ incident: incidentId }).sort({ proposedAt: 1 }).lean();
  }

  return { status, propose, approve, reject, failInterrupted, start, list, forIncident };
}
