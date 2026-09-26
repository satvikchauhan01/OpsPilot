import mongoose from 'mongoose';

const rootCauseSchema = new mongoose.Schema(
  {
    service: String,
    causeType: String,
    title: String,
    confidence: Number,
  },
  { _id: false },
);

// What OpsPilot remembers about a resolved incident: how it looked, what caused it and what
// fixed it. `text` is the description that was embedded, searched through the Atlas Vector
// Search index "incident_memory".
const incidentMemorySchema = new mongoose.Schema(
  {
    incident: { type: mongoose.Schema.Types.ObjectId, ref: 'Incident', required: true, unique: true },
    incidentNumber: { type: Number, required: true },
    title: { type: String, required: true },
    severity: String,
    services: { type: [String], default: [] },
    suspectedService: String,
    startedAt: { type: Date, required: true },
    resolvedAt: Date,
    symptoms: { type: [String], default: [] },
    changesBefore: { type: [String], default: [] },
    rootCause: { type: rootCauseSchema, default: null },
    summary: String,
    fix: {
      summary: String,
      changes: { type: [String], default: [] },
      by: String,
    },
    text: { type: String, required: true },
    embedding: { type: [Number], required: true },
    // Memories written by an older version of the wording are rewritten on startup
    version: { type: Number, required: true },
  },
  { timestamps: true, versionKey: false },
);

export const IncidentMemory = mongoose.model('IncidentMemory', incidentMemorySchema);
