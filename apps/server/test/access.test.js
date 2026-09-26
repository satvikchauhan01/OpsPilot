import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { requireRole } from '../src/auth/middleware.js';
import { sameOriginOnly } from '../src/http/origin.js';
import { perPerson } from '../src/http/limits.js';
import { withTag } from '../src/demo/cluster.js';

// Runs one middleware and returns the error it passed on, or null.
function run(middleware, req) {
  let passed;
  middleware(req, {}, (err) => (passed = err ?? null));
  return passed;
}

describe('roles', () => {
  const asGuest = { user: { role: 'guest' } };

  it('lets guests do what the demo needs', () => {
    assert.equal(run(requireRole('responder', 'guest'), asGuest), null);
  });

  it('keeps guests away from what speaks for the team', () => {
    const err = run(requireRole('responder'), asGuest);
    assert.equal(err.status, 403);
    assert.equal(run(requireRole('responder'), { user: { role: 'viewer' } }).status, 403);
  });

  it('lets admins do everything', () => {
    assert.equal(run(requireRole('responder'), { user: { role: 'admin' } }), null);
  });
});

describe('rate limit keys', () => {
  it('counts people by account, and guests by address since they can start new sessions', () => {
    assert.equal(perPerson({ user: { id: 'u1', role: 'responder' }, ip: '203.0.113.5' }), 'u1');
    const first = perPerson({ user: { id: 'guest-1', role: 'guest' }, ip: '203.0.113.5' });
    assert.equal(first, perPerson({ user: { id: 'guest-2', role: 'guest' }, ip: '203.0.113.5' }));
    assert.notEqual(first, perPerson({ user: { id: 'guest-3', role: 'guest' }, ip: '198.51.100.7' }));
  });
});

describe('same-origin check', () => {
  const check = sameOriginOnly('https://opspilot.example.org');
  const request = (method, origin) => ({ method, get: (name) => (name === 'origin' ? origin : undefined) });

  it('turns away changes sent from another site', () => {
    assert.equal(run(check, request('POST', 'https://evil.example')).status, 403);
  });

  it('accepts its own origin, reads, and calls without an origin', () => {
    assert.equal(run(check, request('POST', 'https://opspilot.example.org')), null);
    assert.equal(run(check, request('GET', 'https://evil.example')), null);
    assert.equal(run(check, request('POST', undefined)), null);
  });
});

describe('image tags', () => {
  it('swaps only the tag', () => {
    assert.equal(withTag('shop.local/checkout:1.4.1', '1.4.2'), 'shop.local/checkout:1.4.2');
    assert.equal(withTag('checkout', '1.4.2'), 'checkout:1.4.2');
  });

  it('does not take a registry port for a tag', () => {
    assert.equal(withTag('registry.local:5000/checkout', '1.4.2'), 'registry.local:5000/checkout:1.4.2');
  });
});
