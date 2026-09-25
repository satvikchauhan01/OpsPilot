import mongoose from 'mongoose';

export const CHANGE_KINDS = [
  'deploy', // container image changed
  'config', // environment or other pod template settings changed
  'restart', // rolling restart
  'scale', // replica count changed
  'rollout', // a rollout finished or got stuck
  'pod_restart', // a container restarted (crash, OOM kill, failed probe)
  'warning', // Kubernetes Warning event
];

// Everything that changed in the monitored namespace, as seen by the change tracker.
const changeSchema = new mongoose.Schema(
  {
    namespace: { type: String, required: true },
    service: { type: String, required: true, index: true },
    kind: { type: String, enum: CHANGE_KINDS, required: true },
    summary: { type: String, required: true },
    details: { type: Object, default: {} },
    at: { type: Date, required: true, index: true },
    // Stable key for things Kubernetes may report more than once (events, restarts)
    source: { type: String },
    // Kubernetes folds repeats of an event into one object with a count
    occurrences: { type: Number, default: 1 },
    lastSeenAt: Date,
  },
  { timestamps: true },
);

changeSchema.index({ source: 1 }, { unique: true, partialFilterExpression: { source: { $type: 'string' } } });

export const Change = mongoose.model('Change', changeSchema);
