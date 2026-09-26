import mongoose from 'mongoose';

// One entry in the audit log: who did what to which incident, when, and how it turned out.
// Records are chained by hash (see audit/chain.js) and never change once written.
const auditEventSchema = new mongoose.Schema(
  {
    seq: { type: Number, required: true, unique: true },
    at: { type: Date, required: true },
    type: { type: String, required: true },
    actor: { type: String, required: true },
    incidentNumber: { type: Number, index: true },
    actionId: String,
    data: { type: Object, default: {} },
    prevHash: { type: String, default: '' },
    hash: { type: String, required: true },
  },
  { versionKey: false },
);

// The application can only add records. An edit made around it still breaks the hash chain.
function refuse() {
  throw new Error('audit records cannot be changed or deleted');
}
for (const operation of [
  'updateOne',
  'updateMany',
  'findOneAndUpdate',
  'replaceOne',
  'findOneAndReplace',
  'deleteOne',
  'deleteMany',
  'findOneAndDelete',
]) {
  auditEventSchema.pre(operation, refuse);
}
auditEventSchema.pre('save', function () {
  if (!this.isNew) refuse();
});

export const AuditEvent = mongoose.model('AuditEvent', auditEventSchema);
