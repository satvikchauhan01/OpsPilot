import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { composePostmortem, parseNarrative, sectionOf, templateNarrative } from '../src/postmortems/document.js';

function facts(overrides = {}) {
  return {
    id: 'INC-019',
    title: 'HighErrorRate on checkout, affecting gateway',
    severity: 'critical',
    services: ['gateway', 'checkout'],
    origin: 'checkout',
    startedAt: '2026-09-26 11:45:31',
    resolvedAt: '2026-09-26 11:52:54',
    duration: '7 min',
    peaks: [
      { service: 'checkout', errorRate: 0.291, p95: 0.242 },
      { service: 'gateway', errorRate: 0.12, p95: null },
    ],
    rootCause: { service: 'checkout', causeType: 'bad_deploy', title: 'checkout 1.4.2 crashes on expired coupons' },
    fix: 'Rolled back checkout 1.4.2 → 1.4.1, approved by Satvik and verified',
    timeline: [
      { time: '11:43:37', text: 'checkout 1.4.1 → 1.4.2' },
      { time: '11:45:44', text: 'INC-19 opened' },
    ],
    ...overrides,
  };
}

function narrative(overrides = {}) {
  return {
    summary: 'Release 1.4.2 of checkout failed on orders with expired coupons until it was rolled back.',
    impact: 'Checkout and the gateway failed a share of orders for 7 minutes.',
    rootCause: 'A pricing change in 1.4.2 read a discount that expired coupons do not have.',
    resolution: 'Checkout was rolled back to 1.4.1 and the error rate went back to zero.',
    wentWell: ['The investigation tied the errors to the release within a minute.'],
    wentBadly: ['The first rollback proposal was rejected.'],
    actionItems: [{ title: 'Add a test for expired coupon codes', priority: 'high' }],
    ...overrides,
  };
}

describe('postmortem narrative', () => {
  it('accepts what the model is asked for', () => {
    const parsed = parseNarrative(narrative());
    assert.equal(parsed.ok, true);
    assert.equal(parsed.narrative.actionItems[0].priority, 'high');
  });

  it('says what is wrong with an invalid answer', () => {
    const parsed = parseNarrative(
      narrative({ wentWell: [], actionItems: [{ title: 'Add tests', priority: 'urgent' }] }),
    );
    assert.equal(parsed.ok, false);
    assert.match(parsed.error, /wentWell/);
    assert.match(parsed.error, /actionItems\.0\.priority/);
  });
});

describe('postmortem document', () => {
  const markdown = composePostmortem(facts(), narrative(), { draftedBy: 'OpsPilot AI (test)' });

  it('fills in the facts from the incident, not from the model', () => {
    assert.match(markdown, /^# Postmortem: INC-019 HighErrorRate on checkout/);
    assert.match(markdown, /\*\*Services:\*\* gateway, checkout \(where it started\)/);
    assert.match(markdown, /\*\*Resolved:\*\* 2026-09-26 11:52:54 UTC, after 7 min/);
    assert.match(markdown, /- checkout: up to 29% of requests failed, p95 latency up to 242 ms/);
    assert.match(markdown, /- gateway: up to 12% of requests failed\n/);
    assert.match(markdown, /- 11:43:37 UTC · checkout 1\.4\.1 → 1\.4\.2/);
  });

  it('has every section, in a fixed order', () => {
    const headings = markdown.split('\n').filter((line) => line.startsWith('## '));
    assert.deepEqual(headings, [
      '## Summary',
      '## Impact',
      '## Timeline',
      '## Root cause',
      '## Resolution',
      '## What went well',
      '## What went badly',
      '## Action items',
    ]);
    assert.match(markdown, /- \[ \] Add a test for expired coupon codes \(high\)/);
  });

  it('says so when there is no root cause, fix or metrics', () => {
    const bare = facts({ rootCause: null, fix: null, peaks: [] });
    const text = composePostmortem(bare, templateNarrative(bare), { draftedBy: 'OpsPilot, from a template' });
    assert.match(text, /\*\*Root cause:\*\* not established/);
    assert.match(text, /\*\*Fix:\*\* none recorded/);
    assert.match(sectionOf(text, 'Summary'), /No root cause was established/);
  });

  it('finds a section again, even after edits', () => {
    assert.equal(sectionOf(markdown, 'Resolution'), narrative().resolution);
    const edited = markdown.replace('## Summary', '## summary ').replaceAll('\n', '\r\n');
    assert.equal(sectionOf(edited, 'Summary'), narrative().summary);
    assert.equal(sectionOf(markdown, 'Lessons'), '');
  });
});
