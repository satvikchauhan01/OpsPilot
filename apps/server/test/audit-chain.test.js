import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { chainHash, verifyChain } from '../src/audit/chain.js';
import { minutes } from './fixtures.js';

function chain(entries) {
  let prevHash = '';
  return entries.map((entry, i) => {
    const record = { seq: i + 1, at: minutes(i), incidentNumber: 4, ...entry, prevHash };
    record.hash = chainHash(prevHash, record);
    prevHash = record.hash;
    return record;
  });
}

const records = chain([
  { type: 'action.proposed', actor: 'OpsPilot AI', data: { action: 'rollback', params: { service: 'checkout' } } },
  { type: 'action.approved', actor: 'ana@example.com', data: { action: 'rollback' } },
  { type: 'action.verified', actor: 'OpsPilot', data: { samples: 9 } },
]);

describe('audit hash chain', () => {
  it('is intact as written', () => {
    const result = verifyChain(records);
    assert.equal(result.intact, true);
    assert.equal(result.records, 3);
    assert.equal(result.head, records[2].hash);
  });

  it('shows an edited record, and the record where the chain breaks', () => {
    const edited = structuredClone(records);
    edited[1].actor = 'someone-else@example.com';
    assert.deepEqual(verifyChain(edited), { intact: false, records: 3, brokenAt: 2 });
  });

  it('shows a removed or reordered record', () => {
    assert.equal(verifyChain([records[0], records[2]]).brokenAt, 3);
    assert.equal(verifyChain([records[1], records[0], records[2]]).brokenAt, 2);
  });

  it('cannot be repaired by recomputing one hash', () => {
    const forged = structuredClone(records);
    forged[1].data = { action: 'scale' };
    forged[1].hash = chainHash(forged[1].prevHash, forged[1]);
    assert.equal(verifyChain(forged).brokenAt, 3);
  });
});
