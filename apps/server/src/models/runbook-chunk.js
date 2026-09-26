import mongoose from 'mongoose';

// One embedded piece of a runbook: its introduction or one of its sections. Searched through
// the Atlas Vector Search index "runbook_chunks".
const runbookChunkSchema = new mongoose.Schema(
  {
    slug: { type: String, required: true, index: true },
    title: { type: String, required: true },
    anchor: { type: String, required: true },
    heading: { type: String, required: true },
    // Position within a section that was too long for one chunk
    part: { type: Number, default: 0 },
    text: { type: String, required: true },
    // Copied from the runbook, so a search can be narrowed to a service or a cause type
    services: { type: [String], default: [] },
    causes: { type: [String], default: [] },
    embedding: { type: [Number], required: true },
  },
  { versionKey: false },
);

export const RunbookChunk = mongoose.model('RunbookChunk', runbookChunkSchema);
