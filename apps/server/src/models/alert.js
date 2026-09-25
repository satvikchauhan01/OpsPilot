import mongoose from 'mongoose';
import { SEVERITIES } from '../alerts/severity.js';

// One document per alert occurrence. Alertmanager's fingerprint identifies the label set,
// and startsAt tells apart separate firings of the same alert.
const alertSchema = new mongoose.Schema(
  {
    fingerprint: { type: String, required: true },
    name: { type: String, required: true },
    service: { type: String, required: true },
    severity: { type: String, enum: SEVERITIES, default: 'warning' },
    status: { type: String, enum: ['firing', 'resolved'], required: true },
    summary: { type: String, default: '' },
    labels: { type: Object, default: {} },
    startsAt: { type: Date, required: true },
    endsAt: Date,
    incident: { type: mongoose.Schema.Types.ObjectId, ref: 'Incident', index: true },
  },
  { timestamps: true },
);

alertSchema.index({ fingerprint: 1, startsAt: 1 }, { unique: true });
alertSchema.index({ status: 1 });

export const Alert = mongoose.model('Alert', alertSchema);
