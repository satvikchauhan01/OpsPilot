import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Investigation } from '../src/models/investigation.js';
import { LlmOverloadedError } from '../src/llm/gemini.js';
import { LIMITS, runInvestigation } from '../src/investigation/investigator.js';

const SERVICES = ['checkout', 'gateway', 'inventory', 'payments'];
const STARTED = new Date('2026-11-01T10:00:00Z');

const incident = {
  _id: 'incident-7',
  number: 7,
  title: 'HighErrorRate on checkout',
  status: 'investigating',
  startedAt: STARTED,
  suspectedService: 'checkout',
};

const alerts = [
  {
    name: 'HighErrorRate',
    service: 'checkout',
    severity: 'critical',
    status: 'firing',
    startsAt: STARTED,
    summary: 'checkout fails 25% of requests',
  },
];

// The five tools every investigation opens with, and one more the model may ask for.
const TOOL_NAMES = [
  'get_service_health',
  'get_call_graph',
  'list_changes',
  'find_similar_incidents',
  'search_runbooks',
  'query_metrics',
];

function fakeTools() {
  const runs = [];
  return {
    runs,
    toolsFor: () => ({
      declarations: TOOL_NAMES.map((name) => ({ name, description: name, parametersJsonSchema: { type: 'object' } })),
      has: (name) => TOOL_NAMES.includes(name),
      title: (name) => name,
      async run(name, args) {
        runs.push(name);
        return { ok: true, args };
      },
    }),
  };
}

// Plays back one scripted turn per request and keeps a copy of what each request held.
// A turn is a reply ({ calls }) or a function of the request that returns or throws.
function fakeLlm(turns, { fallbackModel = 'fallback-model' } = {}) {
  const requests = [];
  return {
    requests,
    model: 'main-model',
    fallbackModel,
    pickModel: () => 'main-model',
    async generate(request) {
      requests.push({ model: request.model, allowedTools: request.allowedTools, contents: [...request.contents] });
      const turn = turns[requests.length - 1];
      if (!turn) throw new Error('the model was asked more often than the script says');
      const reply = typeof turn === 'function' ? turn(request) : turn;
      return {
        message: { role: 'model', parts: [] },
        text: '',
        usage: { inputTokens: 120, outputTokens: 30 },
        ...reply,
      };
    },
  };
}

let callIds = 0;
const call = (name, args = {}) => ({ id: `call-${(callIds += 1)}`, name, args });

function findings(evidence = [{ id: 'E4', finding: 'checkout 1.4.2 rolled out a minute before the errors' }]) {
  return {
    summary: 'Checkout fails orders with expired coupons since release 1.4.2.',
    hypotheses: [
      {
        title: 'checkout 1.4.2 crashes on expired coupon codes',
        service: 'checkout',
        causeType: 'bad_deploy',
        confidence: 0.9,
        reasoning: 'The errors began with the 1.4.2 rollout, and only the new pods fail.',
        evidence,
        suggestedAction: 'rollback',
      },
    ],
  };
}

const submit = (args = findings()) => ({ calls: [call('submit_findings', args)] });

// What the investigator answered to the model's calls, as sent with a later request.
function answersIn(request) {
  return request.contents.at(-1).parts.map((part) => part.functionResponse.response);
}

async function investigate(llm, tools = fakeTools()) {
  const investigation = new Investigation({ incidentNumber: incident.number, trigger: 'auto', status: 'queued' });
  const saved = [];
  await runInvestigation({
    investigation,
    incident,
    llm,
    services: SERVICES,
    knowledge: { runbooks: { openingQuery: async () => 'checkout errors after a deploy' } },
    toolsFor: tools.toolsFor,
    findAlerts: async () => alerts,
    save: async (doc) => saved.push(doc.status),
  });
  return { investigation, saved, tools };
}

describe('investigation loop', () => {
  it('stores every step through the save it was given', async () => {
    const { investigation, saved } = await investigate(fakeLlm([submit()]));

    assert.equal(investigation.status, 'completed');
    assert.equal(investigation.result.hypotheses[0].service, 'checkout');
    assert.equal(saved[0], 'running');
    assert.equal(saved.at(-1), 'completed');
    // E1 is the alerts, E2 to E6 the opening tools
    assert.deepEqual(
      investigation.evidence.map((item) => item.id),
      ['E1', 'E2', 'E3', 'E4', 'E5', 'E6'],
    );
  });

  it('answers a call to an unknown tool with an error and carries on', async () => {
    const llm = fakeLlm([{ calls: [call('delete_cluster')] }, submit()]);
    const { investigation, tools } = await investigate(llm);

    assert.deepEqual(answersIn(llm.requests[1]), [{ error: 'there is no tool called delete_cluster' }]);
    assert.ok(!tools.runs.includes('delete_cluster'));
    assert.equal(investigation.status, 'completed');
  });

  it('stops running tools once the budget is used up, then only lets the model submit', async () => {
    const asked = 20;
    const llm = fakeLlm([
      { calls: Array.from({ length: asked }, () => call('query_metrics', { query: 'up' })) },
      submit(),
    ]);
    const { investigation, tools } = await investigate(llm);

    assert.equal(tools.runs.length, LIMITS.toolCalls);
    const answers = answersIn(llm.requests[1]);
    const refused = answers.filter((answer) => answer.error === 'tool budget used up, submit your findings now');
    assert.equal(refused.length, asked - tools.runs.filter((name) => name === 'query_metrics').length);
    assert.ok(refused.length > 0);

    assert.equal(llm.requests[0].allowedTools, undefined);
    assert.deepEqual(llm.requests[1].allowedTools, ['submit_findings']);
    assert.equal(investigation.status, 'completed');
  });

  it('gives the model one chance to fix invalid findings, and fails on the second', async () => {
    const madeUp = findings([{ id: 'E99', finding: 'evidence nobody gathered' }]);
    const llm = fakeLlm([submit(madeUp), submit(madeUp)]);
    const { investigation } = await investigate(llm);

    assert.match(answersIn(llm.requests[1])[0].error, /^Findings rejected, fix and resubmit: .*E99/);
    assert.equal(llm.requests.length, 2);
    assert.equal(investigation.status, 'failed');
    assert.match(investigation.error, /the model's findings were invalid twice/);
  });

  it('hands over to the fallback model, with all the evidence, when the main one is overloaded', async () => {
    const llm = fakeLlm([
      () => {
        throw new LlmOverloadedError('main-model is overloaded right now (HTTP 503)');
      },
      submit(),
    ]);
    const { investigation } = await investigate(llm);

    assert.deepEqual(
      llm.requests.map((request) => request.model),
      ['main-model', 'fallback-model'],
    );
    // A fresh conversation: just the briefing and the evidence gathered before the handover
    const [opening] = llm.requests[1].contents;
    assert.equal(llm.requests[1].contents.length, 1);
    assert.match(opening.parts[1].text, /^E1 · /);
    assert.match(opening.parts[1].text, /E6 · search_runbooks/);

    assert.ok(
      investigation.steps.some((step) => step.title === 'main-model is unavailable, handing over to fallback-model'),
    );
    assert.equal(investigation.model, 'fallback-model');
    assert.equal(investigation.status, 'completed');
  });

  it('fails when the main model is overloaded and there is no fallback', async () => {
    const llm = fakeLlm(
      [
        () => {
          throw new LlmOverloadedError('main-model is overloaded right now (HTTP 503)');
        },
      ],
      { fallbackModel: null },
    );
    const { investigation } = await investigate(llm);

    assert.equal(llm.requests.length, 1);
    assert.equal(investigation.status, 'failed');
    assert.match(investigation.error, /overloaded/);
  });
});
