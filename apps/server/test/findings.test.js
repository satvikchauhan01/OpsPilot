import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { validateFindings } from '../src/investigation/findings.js';

const context = {
  evidenceIds: new Set(['E1', 'E2', 'E3']),
  services: ['checkout', 'gateway', 'inventory', 'payments'],
};

function hypothesis(overrides = {}) {
  return {
    title: 'checkout 1.4.2 crashes on expired coupons',
    service: 'checkout',
    causeType: 'bad_deploy',
    confidence: 0.8,
    reasoning: 'Errors started right after the 1.4.2 rollout and only 1.4.2 pods fail.',
    evidence: [{ id: 'E2', finding: 'TypeError in pricing.js since 10:32' }],
    suggestedAction: 'rollback',
    ...overrides,
  };
}

describe('findings validation', () => {
  it('accepts well-formed findings and ranks hypotheses by confidence', () => {
    const outcome = validateFindings(
      {
        summary: 'Checkout fails for orders with expired coupons since release 1.4.2.',
        hypotheses: [hypothesis({ confidence: 0.2, service: 'payments', causeType: 'slow_dependency' }), hypothesis()],
      },
      context,
    );
    assert.equal(outcome.ok, true);
    assert.deepEqual(
      outcome.result.hypotheses.map((h) => h.service),
      ['checkout', 'payments'],
    );
  });

  it('rejects evidence the investigation never gathered', () => {
    const outcome = validateFindings(
      {
        summary: 'Something is off in checkout.',
        hypotheses: [hypothesis({ evidence: [{ id: 'E9', finding: 'made up' }] })],
      },
      context,
    );
    assert.equal(outcome.ok, false);
    assert.match(outcome.error, /E9/);
  });

  it('rejects services that do not exist', () => {
    const outcome = validateFindings(
      { summary: 'The database is down again.', hypotheses: [hypothesis({ service: 'database' })] },
      context,
    );
    assert.equal(outcome.ok, false);
    assert.match(outcome.error, /database/);
  });

  it('rejects hypotheses without evidence or with an unknown cause type', () => {
    assert.equal(
      validateFindings({ summary: 'No proof at all.', hypotheses: [hypothesis({ evidence: [] })] }, context).ok,
      false,
    );
    assert.equal(
      validateFindings(
        { summary: 'Cosmic rays, probably.', hypotheses: [hypothesis({ causeType: 'cosmic_rays' })] },
        context,
      ).ok,
      false,
    );
  });

  it('rejects more than three hypotheses', () => {
    const four = [1, 2, 3, 4].map(() => hypothesis());
    assert.equal(validateFindings({ summary: 'Too many guesses here.', hypotheses: four }, context).ok, false);
  });
});
