import mongoose from 'mongoose';

// Requests and tokens per UTC day, so the daily free-tier quota is respected even across
// server restarts.
const llmUsageSchema = new mongoose.Schema({
  day: { type: String, required: true, unique: true },
  requests: { type: Number, default: 0 },
  inputTokens: { type: Number, default: 0 },
  outputTokens: { type: Number, default: 0 },
});

export const LlmUsage = mongoose.model('LlmUsage', llmUsageSchema);

export function today() {
  return new Date().toISOString().slice(0, 10);
}
