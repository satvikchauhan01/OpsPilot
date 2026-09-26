import mongoose from 'mongoose';

const baselineSchema = new mongoose.Schema(
  { name: String, container: String, image: String, replicas: Number },
  { _id: false },
);

const activeSchema = new mongoose.Schema(
  {
    key: { type: String, required: true },
    startedAt: { type: Date, required: true },
    by: String,
    resetAt: { type: Date, required: true },
    // Versions and replica counts from just before the scenario, to put back on reset
    baseline: { type: [baselineSchema], default: [] },
  },
  { _id: false },
);

// The demo control's one piece of state: which scenario is running, and when the shop was
// last put back. Stored, so a server restart doesn't forget to reset the shop.
const demoStateSchema = new mongoose.Schema(
  {
    _id: { type: String, default: 'demo' },
    active: { type: activeSchema, default: null },
    lastResetAt: Date,
    lastResetBy: String,
  },
  { versionKey: false },
);

export const DemoState = mongoose.model('DemoState', demoStateSchema);
