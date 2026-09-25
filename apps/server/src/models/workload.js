import mongoose from 'mongoose';

// The last Deployment spec the change tracker saw. It lets the tracker still spot a change
// that happened while OpsPilot was down, by comparing against this snapshot on startup.
const workloadSchema = new mongoose.Schema(
  {
    namespace: { type: String, required: true },
    name: { type: String, required: true },
    generation: Number,
    snapshot: { type: Object, required: true },
  },
  { timestamps: true },
);

workloadSchema.index({ namespace: 1, name: 1 }, { unique: true });

export const Workload = mongoose.model('Workload', workloadSchema);
