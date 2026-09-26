import mongoose from 'mongoose';

const sectionSchema = new mongoose.Schema(
  {
    anchor: { type: String, required: true },
    heading: { type: String, required: true },
    markdown: { type: String, default: '' },
  },
  { _id: false },
);

// A runbook as read from its Markdown file. The file stays the source of truth: this copy is
// what the UI shows, and the chunks in RunbookChunk are what search runs over.
const runbookSchema = new mongoose.Schema(
  {
    slug: { type: String, required: true, unique: true },
    title: { type: String, required: true },
    summary: { type: String, default: '' },
    owner: String,
    services: { type: [String], default: [] },
    alerts: { type: [String], default: [] },
    causes: { type: [String], default: [] },
    actions: { type: [String], default: [] },
    intro: { type: String, default: '' },
    sections: { type: [sectionSchema], default: [] },
    // Fingerprint of the file, so an unchanged runbook isn't embedded again on every start
    hash: { type: String, required: true },
    indexedAt: Date,
  },
  { versionKey: false },
);

export const Runbook = mongoose.model('Runbook', runbookSchema);
