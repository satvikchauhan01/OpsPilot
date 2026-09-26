import { createHash } from 'node:crypto';

// Every audit record carries the hash of the one before it. Changing, removing or reordering
// any record breaks every hash after it, so an edit made behind the application's back shows.

export function chainHash(prevHash, record) {
  const content = JSON.stringify([
    record.seq,
    new Date(record.at).toISOString(),
    record.type,
    record.actor,
    record.incidentNumber ?? null,
    record.actionId ?? null,
    record.data ?? {},
  ]);
  return createHash('sha256').update(`${prevHash}\n${content}`).digest('hex');
}

// Walks the records in sequence order. Returns where the chain first breaks, if it does.
export function verifyChain(records) {
  let prevHash = '';
  for (const record of records) {
    if (record.prevHash !== prevHash || chainHash(prevHash, record) !== record.hash) {
      return { intact: false, records: records.length, brokenAt: record.seq };
    }
    prevHash = record.hash;
  }
  return { intact: true, records: records.length, head: prevHash || null };
}
