import mongoose from 'mongoose';
import { SEVERITIES } from '../alerts/severity.js';
import { INCIDENT_STATUSES } from '../incidents/status.js';

const historySchema = new mongoose.Schema(
  {
    at: { type: Date, default: Date.now },
    type: { type: String, enum: ['opened', 'alert', 'status', 'note'], required: true },
    from: String,
    to: String,
    by: { type: String, default: 'system' },
    note: String,
  },
  { _id: false },
);

const incidentSchema = new mongoose.Schema(
  {
    // Human-friendly id shown as INC-<number>
    number: { type: Number, required: true, unique: true },
    title: { type: String, required: true },
    status: { type: String, enum: INCIDENT_STATUSES, default: 'open', index: true },
    severity: { type: String, enum: SEVERITIES, required: true },
    services: { type: [String], default: [] },
    suspectedService: String,
    startedAt: { type: Date, required: true },
    lastAlertAt: { type: Date, required: true },
    // Set while every alert of the incident is resolved, cleared as soon as one fires again.
    alertsResolvedAt: Date,
    resolvedAt: Date,
    history: { type: [historySchema], default: [] },
  },
  { timestamps: true },
);

incidentSchema.index({ startedAt: -1 });

export const Incident = mongoose.model('Incident', incidentSchema);
