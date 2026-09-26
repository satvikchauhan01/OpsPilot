import mongoose from 'mongoose';

export const POSTMORTEM_STATUSES = [
  'drafting', // being written
  'draft', // written, open for edits
  'final', // signed off, no more edits
  'failed', // could not be written, can be asked for again
];

// The postmortem of a resolved incident, as a Markdown document. OpsPilot drafts it; people
// edit it and mark it final, and the final version goes into incident memory.
const postmortemSchema = new mongoose.Schema(
  {
    incident: { type: mongoose.Schema.Types.ObjectId, ref: 'Incident', required: true, unique: true },
    incidentNumber: { type: Number, required: true },
    status: { type: String, enum: POSTMORTEM_STATUSES, default: 'drafting' },
    markdown: { type: String, default: '' },
    // Who wrote the draft: the model, or the template when no model was available
    draftedBy: String,
    draftNote: String,
    draftedAt: Date,
    editedBy: String,
    editedAt: Date,
    finalizedBy: String,
    finalizedAt: Date,
  },
  { timestamps: true },
);

export const Postmortem = mongoose.model('Postmortem', postmortemSchema);
