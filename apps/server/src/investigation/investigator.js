import { Alert } from '../models/alert.js';
import { bus } from '../realtime/bus.js';
import { logger } from '../logger.js';
import { createSerialQueue } from '../lib/serial-queue.js';
import { createTools } from './tools.js';
import { FINDINGS_PARAMETERS, validateFindings } from './findings.js';
import { briefing, systemPrompt } from './prompt.js';

// Guardrails that keep one investigation inside the free tier and a sensible wait.
export const LIMITS = {
  toolCalls: 15,
  turns: 12,
  durationMs: 6 * 60_000,
  tokens: 400_000,
};

// Always gathered first, so the model starts from the same basic picture a human would.
const OPENING_TOOLS = [
  ['get_service_health', {}],
  ['get_call_graph', {}],
  ['list_changes', { minutes: 60 }],
];

const SUBMIT = {
  name: 'submit_findings',
  description: 'Submit the investigation result. Call this exactly once, when done.',
  parametersJsonSchema: FINDINGS_PARAMETERS,
};

/**
 * Runs one investigation to completion and stores every step as it happens.
 * `investigation` is a queued Investigation document for `incident`.
 */
export async function runInvestigation({ investigation, incident, llm, telemetry, services }) {
  const started = Date.now();
  const anchor = incident.status === 'resolved' && incident.resolvedAt ? incident.resolvedAt : new Date();
  const tools = createTools({ ...telemetry, anchor, incidentStart: incident.startedAt });
  const run = createRecorder(investigation);

  try {
    await run.update({ status: 'running', startedAt: new Date(), model: llm.model });

    const alerts = await Alert.find({ incident: incident._id }).sort({ startsAt: 1 });
    await run.addEvidence({
      tool: 'incident_alerts',
      title: 'Alerts in this incident',
      args: {},
      result: {
        alerts: alerts.map(({ name, service, severity, status, startsAt, endsAt, summary }) => ({
          name,
          service,
          severity,
          status,
          startsAt,
          endsAt,
          summary,
        })),
      },
    });
    await run.step({
      kind: 'context',
      title: `Read ${alerts.length} alert${alerts.length === 1 ? '' : 's'} from the incident`,
      evidenceId: 'E1',
    });

    const opening = await Promise.all(OPENING_TOOLS.map(([name, args]) => runTool(run, tools, name, args, 'context')));

    const contents = [
      {
        role: 'user',
        parts: [
          { text: briefing({ incident, alerts, heuristicSuspect: incident.suspectedService, now: anchor }) },
          { text: formatEvidence(run.evidence()) },
        ],
      },
    ];
    const system = systemPrompt({ services, maxToolCalls: LIMITS.toolCalls });
    let toolCalls = opening.length;
    let invalidSubmissions = 0;

    for (let turn = 1; turn <= LIMITS.turns; turn += 1) {
      const outOfBudget =
        toolCalls >= LIMITS.toolCalls ||
        Date.now() - started > LIMITS.durationMs ||
        run.tokens() > LIMITS.tokens ||
        turn === LIMITS.turns;

      const reply = await llm.generate({
        system,
        contents,
        tools: [...tools.declarations, SUBMIT],
        allowedTools: outOfBudget ? ['submit_findings'] : undefined,
      });
      await run.countUsage(reply.usage);
      contents.push(reply.message);
      if (reply.text) await run.step({ kind: 'note', title: reply.text.slice(0, 600) });

      const responses = [];
      for (const call of reply.calls) {
        if (call.name === 'submit_findings') {
          const outcome = validateFindings(call.args, { evidenceIds: run.evidenceIds(), services });
          if (outcome.ok) return await run.finish(outcome.result);

          invalidSubmissions += 1;
          await run.step({ kind: 'error', title: `Findings were rejected: ${outcome.error}` });
          if (invalidSubmissions > 1) throw new Error(`the model's findings were invalid twice: ${outcome.error}`);
          responses.push(functionResponse(call, { error: `Findings rejected, fix and resubmit: ${outcome.error}` }));
          continue;
        }

        if (!tools.has(call.name)) {
          responses.push(functionResponse(call, { error: `there is no tool called ${call.name}` }));
          continue;
        }
        if (toolCalls >= LIMITS.toolCalls) {
          responses.push(functionResponse(call, { error: 'tool budget used up, submit your findings now' }));
          continue;
        }
        toolCalls += 1;
        const { id, result } = await runTool(run, tools, call.name, call.args ?? {}, 'tool');
        responses.push(functionResponse(call, { evidence: id, result }));
      }

      if (responses.length === 0) {
        contents.push({ role: 'user', parts: [{ text: 'Use a tool, or call submit_findings if you are done.' }] });
      } else {
        contents.push({ role: 'user', parts: responses });
      }
    }
    throw new Error('the investigation ended without findings');
  } catch (err) {
    logger.warn({ incident: incident.number, err: err.message }, 'investigation failed');
    await run.fail(err.message);
  }
}

async function runTool(run, tools, name, args, kind) {
  const title = tools.title(name, args);
  const step = await run.step({ kind, title, tool: name, status: 'running' });
  const startedAt = Date.now();
  const result = await tools.run(name, args);
  const id = await run.addEvidence({ tool: name, title, args, result });
  await run.completeStep(step, {
    evidenceId: id,
    status: result.error ? 'failed' : 'done',
    durationMs: Date.now() - startedAt,
  });
  return { id, result };
}

function functionResponse(call, response) {
  return { functionResponse: { id: call.id, name: call.name, response } };
}

function formatEvidence(evidence) {
  return evidence.map(({ id, title, result }) => `${id} · ${title}\n${JSON.stringify(result)}`).join('\n\n');
}

// Persists the investigation as it progresses and tells browsers about every change.
// Saves go through a queue because the opening tools run in parallel, and Mongoose refuses
// to save one document twice at the same time.
function createRecorder(investigation) {
  const doc = investigation;
  const enqueue = createSerialQueue();
  let tokens = 0;

  function save() {
    return enqueue(async () => {
      await doc.save();
      bus.publish('investigation.updated', { incidentNumber: doc.incidentNumber, id: doc.id, status: doc.status });
    });
  }

  return {
    evidence: () => doc.evidence,
    evidenceIds: () => new Set(doc.evidence.map((item) => item.id)),
    tokens: () => tokens,

    async update(fields) {
      doc.set(fields);
      await save();
    },

    async step(step) {
      doc.steps.push({ at: new Date(), ...step });
      await save();
      return doc.steps.length - 1;
    },

    async completeStep(index, fields) {
      Object.assign(doc.steps[index], fields);
      doc.markModified('steps');
      await save();
    },

    async addEvidence(item) {
      const id = `E${doc.evidence.length + 1}`;
      doc.evidence.push({ id, at: new Date(), ...item });
      await save();
      return id;
    },

    async countUsage({ inputTokens, outputTokens }) {
      tokens += inputTokens + outputTokens;
      doc.usage.requests += 1;
      doc.usage.inputTokens += inputTokens;
      doc.usage.outputTokens += outputTokens;
      await save();
    },

    async finish(result) {
      const top = result.hypotheses[0];
      doc.steps.push({
        at: new Date(),
        kind: 'result',
        title: `Most likely: ${top.title} (${Math.round(top.confidence * 100)}%)`,
      });
      doc.set({ status: 'completed', result, finishedAt: new Date() });
      await save();
      return doc;
    },

    async fail(message) {
      doc.steps.push({ at: new Date(), kind: 'error', title: message });
      doc.set({ status: 'failed', error: message, finishedAt: new Date() });
      await save();
      return doc;
    },
  };
}
