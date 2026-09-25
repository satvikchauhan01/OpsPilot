import mongoose from 'mongoose';

const stepSchema = new mongoose.Schema(
  {
    at: { type: Date, default: Date.now },
    kind: { type: String, enum: ['context', 'tool', 'note', 'result', 'error'], required: true },
    title: { type: String, required: true },
    tool: String,
    evidenceId: String,
    status: { type: String, enum: ['running', 'done', 'failed'], default: 'done' },
    durationMs: Number,
  },
  { _id: false },
);

// Every piece of data the investigation looked at. Findings cite these by id, so each
// claim can be traced back to the exact query and what it returned.
const evidenceSchema = new mongoose.Schema(
  {
    id: { type: String, required: true },
    tool: { type: String, required: true },
    title: { type: String, required: true },
    args: { type: Object, default: {} },
    result: { type: Object, default: {} },
    at: { type: Date, default: Date.now },
  },
  { _id: false },
);

const investigationSchema = new mongoose.Schema(
  {
    incident: { type: mongoose.Schema.Types.ObjectId, ref: 'Incident', required: true, index: true },
    incidentNumber: { type: Number, required: true },
    trigger: { type: String, enum: ['auto', 'manual', 'evaluation'], required: true },
    requestedBy: String,
    status: { type: String, enum: ['queued', 'running', 'completed', 'failed'], default: 'queued' },
    model: String,
    startedAt: Date,
    finishedAt: Date,
    steps: { type: [stepSchema], default: [] },
    evidence: { type: [evidenceSchema], default: [] },
    result: { type: Object },
    usage: {
      requests: { type: Number, default: 0 },
      inputTokens: { type: Number, default: 0 },
      outputTokens: { type: Number, default: 0 },
    },
    error: String,
  },
  { timestamps: true },
);

export const Investigation = mongoose.model('Investigation', investigationSchema);
