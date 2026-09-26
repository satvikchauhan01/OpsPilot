import mongoose from 'mongoose';
import { ACTION_TYPES } from '../remediation/catalog.js';

export const ACTION_STATUSES = [
  'proposed', // waiting for a responder
  'approved', // approved, about to run
  'running', // patched, rolling out
  'verifying', // rolled out, watching the metrics
  'verified', // the incident's metrics came back inside their limits
  'failed', // the rollout or the verification failed, see failedStage
  'rejected', // a responder said no
  'superseded', // a newer proposal replaced it before anyone decided
  'cancelled', // the incident was resolved before anyone decided
];

// An approval puts an action here until it has run its course.
export const ACTIVE_STATUSES = ['approved', 'running', 'verifying'];

const sampleSchema = new mongoose.Schema({ at: Date, values: Object }, { _id: false });

// A fix for an incident, from proposal to verified outcome. The audit log keeps the full
// history; this document is the current state.
const actionSchema = new mongoose.Schema(
  {
    incident: { type: mongoose.Schema.Types.ObjectId, ref: 'Incident', required: true, index: true },
    incidentNumber: { type: Number, required: true },
    type: { type: String, enum: ACTION_TYPES, required: true },
    params: { type: Object, required: true },
    // What it does, worked out from the cluster when proposed: versions, revisions, replicas
    plan: { type: Object, required: true },
    status: { type: String, enum: ACTION_STATUSES, default: 'proposed', index: true },
    reason: String,
    source: {
      kind: { type: String, enum: ['investigation', 'responder'] },
      investigation: mongoose.Schema.Types.ObjectId,
      hypothesis: String,
      confidence: Number,
      causeType: String,
    },
    runbook: { slug: String, title: String, anchor: String, heading: String },
    proposedBy: { type: String, required: true },
    proposedAt: { type: Date, required: true },
    decidedBy: String,
    decidedAt: Date,
    rejectionReason: String,
    startedAt: Date,
    // Pods of the new version while the rollout runs
    rollout: { updated: Number, available: Number, wanted: Number },
    rolledOutAt: Date,
    finishedAt: Date,
    failedStage: { type: String, enum: ['execution', 'verification', 'interrupted'] },
    error: String,
    verification: {
      startedAt: Date,
      endsAt: Date,
      judgeFrom: Date,
      services: [String],
      samples: { type: [sampleSchema], default: undefined },
      breaches: { type: [Object], default: undefined },
    },
  },
  { timestamps: true },
);

export const Action = mongoose.model('Action', actionSchema);
