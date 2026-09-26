import { AuditEvent } from '../models/audit-event.js';
import { bus } from '../realtime/bus.js';
import { createSerialQueue } from '../lib/serial-queue.js';
import { chainHash, verifyChain } from './chain.js';

export function createAuditLog() {
  // One write at a time, so every record links to the one written just before it.
  const enqueue = createSerialQueue();

  function append({ type, actor, incidentNumber, actionId, data = {} }) {
    return enqueue(async () => {
      const last = await AuditEvent.findOne({}, 'seq hash').sort({ seq: -1 }).lean();
      const record = {
        seq: (last?.seq ?? 0) + 1,
        at: new Date(),
        type,
        actor,
        incidentNumber,
        actionId: actionId ? String(actionId) : undefined,
        data,
        prevHash: last?.hash ?? '',
      };
      record.hash = chainHash(record.prevHash, record);
      const saved = await AuditEvent.create(record);
      bus.publish('audit.appended', { seq: saved.seq, incidentNumber });
      return saved;
    });
  }

  // Newest first. `before` pages back through older records by sequence number.
  async function list({ incident, type, before, limit = 100 } = {}) {
    const filter = {};
    if (incident) filter.incidentNumber = incident;
    if (type) filter.type = type;
    if (before) filter.seq = { $lt: before };
    const records = await AuditEvent.find(filter).sort({ seq: -1 }).limit(limit).lean();
    return records.map(({ _id, ...record }) => record);
  }

  async function verify() {
    return verifyChain(await AuditEvent.find().sort({ seq: 1 }).lean());
  }

  return { append, list, verify };
}
