import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { describeIncident } from '../src/knowledge/incident-text.js';
import { alertWords, plainText } from '../src/knowledge/text.js';

// S4 as it arrives: the saturation alert fires last, after the errors it causes upstream.
const alerts = [
  { name: 'HighLatency', service: 'payments' },
  { name: 'HighLatency', service: 'checkout' },
  { name: 'HighErrorRate', service: 'payments' },
  { name: 'HighErrorRate', service: 'gateway' },
  { name: 'WorkerPoolSaturated', service: 'payments' },
  { name: 'HighLatency', service: 'payments' },
];

describe('incident descriptions', () => {
  it("spell out the starting service's own symptoms and only name the others", () => {
    assert.equal(
      describeIncident({ alerts, suspectedService: 'payments' }),
      [
        'Starts in payments: high latency, high error rate, worker pool saturated.',
        'Also affected: checkout, gateway.',
      ].join('\n'),
    );
  });

  it('add recent changes, the root cause and the fix once they are known', () => {
    const text = describeIncident({
      alerts: [{ name: 'HighErrorRate', service: 'checkout' }],
      suspectedService: 'checkout',
      changesBefore: [{ kind: 'deploy', summary: 'checkout 1.4.1 → 1.4.2' }],
      rootCause: { causeType: 'bad_deploy', service: 'checkout', title: 'Release 1.4.2 fails on expired coupons' },
      fix: 'checkout 1.4.2 → 1.4.1',
    });
    assert.equal(
      text,
      [
        'Starts in checkout: high error rate.',
        'Changed shortly before: deploy: checkout 1.4.1 → 1.4.2.',
        'Root cause: bad deploy in checkout. Release 1.4.2 fails on expired coupons.',
        'Fixed by: checkout 1.4.2 → 1.4.1.',
      ].join('\n'),
    );
  });

  it('fall back to the first alerting service when there is no suspect', () => {
    assert.match(describeIncident({ alerts }), /^Starts in payments: /);
  });
});

describe('text helpers', () => {
  it('split alert names into words', () => {
    assert.equal(alertWords('HighErrorRate'), 'high error rate');
    assert.equal(alertWords('PodCrashLooping'), 'pod crash looping');
  });

  it('turn Markdown into plain paragraphs without code', () => {
    const markdown = 'Use **Restart** on `payments`.\n\n```sh\nkubectl get pods\n```\n\n- one\n- two';
    assert.equal(plainText(markdown), 'Use Restart on payments.\n\none two');
  });
});
