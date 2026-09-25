import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { condenseTrace, firstAppFrame, groupLogs } from '../src/investigation/condense.js';

const STACK = [
  "TypeError: Cannot read properties of undefined (reading 'percentOff')",
  '    at priceOrder (/app/src/checkout/pricing.js:23:40)',
  '    at /app/src/checkout/index.js:18:21',
  '    at process.processTicksAndRejections (node:internal/process/task_queues:105:5)',
].join('\n');

function log(at, overrides = {}) {
  return {
    at: new Date(at),
    line: 'request failed',
    labels: {
      detected_level: 'error',
      exception_type: 'TypeError',
      exception_message: "Cannot read properties of undefined (reading 'percentOff')",
      exception_stacktrace: STACK,
      service_version: '1.4.2',
      k8s_pod_name: 'checkout-a',
      trace_id: 'abc',
      method: 'POST',
      path: '/orders',
      ...overrides,
    },
  };
}

describe('log grouping', () => {
  it('folds identical errors into one group with a count and time span', () => {
    const groups = groupLogs([
      log('2026-09-25T10:00:05Z'),
      log('2026-09-25T10:00:01Z', { k8s_pod_name: 'checkout-b' }),
      log('2026-09-25T10:00:09Z'),
    ]);
    assert.equal(groups.length, 1);
    assert.deepEqual(
      { count: groups[0].count, pods: groups[0].pods, versions: groups[0].versions, request: groups[0].request },
      { count: 3, pods: 2, versions: ['1.4.2'], request: 'POST /orders' },
    );
    assert.equal(groups[0].firstAt, '2026-09-25T10:00:01.000Z');
    assert.equal(groups[0].exception.where, 'priceOrder (/app/src/checkout/pricing.js:23:40)');
  });

  it('keeps different problems apart and puts the most frequent first', () => {
    const timeout = {
      exception_type: 'UpstreamError',
      exception_message: 'payments: no response within 2000ms',
      exception_stacktrace: '',
    };
    const groups = groupLogs([log(1), log(2, timeout), log(3, timeout)]);
    assert.deepEqual(
      groups.map((group) => [group.exception.type, group.count]),
      [
        ['UpstreamError', 2],
        ['TypeError', 1],
      ],
    );
  });
});

describe('stack frames', () => {
  it('skips Node internals', () => {
    assert.equal(
      firstAppFrame('Error: x\n    at node:internal/foo:1:1\n    at handler (/app/src/a.js:2:3)'),
      'handler (/app/src/a.js:2:3)',
    );
  });
});

describe('trace condensing', () => {
  const span = (service, name, startMs, endMs, error) => ({
    service,
    span: {
      name,
      startTimeUnixNano: String(startMs * 1e6),
      endTimeUnixNano: String(endMs * 1e6),
      status: error ? { code: 'STATUS_CODE_ERROR', message: error } : {},
    },
  });
  const trace = {
    resourceSpans: [
      span('gateway', 'POST /api/checkout', 0, 2100),
      span('checkout', 'POST /orders', 10, 2090, 'payments: no response within 2000ms'),
      span('payments', 'POST /charges', 40, 2600),
    ].map(({ service, span: s }) => ({
      resource: { attributes: [{ key: 'service.name', value: { stringValue: service } }] },
      scopeSpans: [{ spans: [s] }],
    })),
  };

  it('lists spans in start order with offsets, durations and errors', () => {
    const condensed = condenseTrace(trace);
    assert.equal(condensed.durationMs, 2600);
    assert.equal(condensed.errorSpans, 1);
    assert.deepEqual(
      condensed.spans.map((s) => [s.service, s.offsetMs, s.durationMs, s.error]),
      [
        ['gateway', 0, 2100, false],
        ['checkout', 10, 2080, true],
        ['payments', 40, 2560, false],
      ],
    );
  });

  it('returns null for an empty trace', () => {
    assert.equal(condenseTrace({ resourceSpans: [] }), null);
  });
});
