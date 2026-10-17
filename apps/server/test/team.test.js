import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { teamChangeRefusal } from '../src/auth/team.js';
import { furthestFix, progressByIncident } from '../src/incidents/progress.js';

describe('team changes', () => {
  const admin = { id: 'a1', role: 'admin' };
  const responder = { id: 'r1', role: 'responder' };

  it('lets an admin change and remove other people', () => {
    assert.equal(
      teamChangeRefusal({ actor: admin, target: responder, change: 'role', role: 'viewer', admins: 1 }),
      null,
    );
    assert.equal(teamChangeRefusal({ actor: admin, target: responder, change: 'remove', admins: 1 }), null);
  });

  it('never lets an admin change or remove themselves', () => {
    assert.match(
      teamChangeRefusal({ actor: admin, target: admin, change: 'role', role: 'viewer', admins: 2 }),
      /own role/,
    );
    assert.match(teamChangeRefusal({ actor: admin, target: admin, change: 'remove', admins: 2 }), /yourself/);
  });

  it('keeps at least one admin', () => {
    const other = { id: 'a2', role: 'admin' };
    assert.match(teamChangeRefusal({ actor: admin, target: other, change: 'remove', admins: 1 }), /at least one admin/);
    assert.equal(teamChangeRefusal({ actor: admin, target: other, change: 'remove', admins: 2 }), null);
    assert.equal(teamChangeRefusal({ actor: admin, target: other, change: 'role', role: 'admin', admins: 1 }), null);
  });
});

describe('incident progress', () => {
  it('keeps the fix that got furthest', () => {
    assert.equal(furthestFix(['failed', 'verified', 'proposed']), 'verified');
    assert.equal(furthestFix(['rejected', 'proposed']), 'proposed');
    assert.equal(furthestFix([]), null);
  });

  it('collects each incident’s investigation, fix and postmortem', () => {
    const progress = progressByIncident({
      investigations: [{ incident: 'i1', status: 'completed' }],
      actions: [
        { incident: 'i1', status: 'rejected' },
        { incident: 'i1', status: 'verifying' },
        { incident: 'i2', status: 'proposed' },
      ],
      postmortems: [{ incident: 'i1', status: 'final' }],
    });
    assert.deepEqual(progress.get('i1'), { investigation: 'completed', fix: 'verifying', postmortem: 'final' });
    assert.deepEqual(progress.get('i2'), { investigation: null, fix: 'proposed', postmortem: null });
  });
});
