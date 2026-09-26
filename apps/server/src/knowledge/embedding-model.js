import { pipeline } from '@huggingface/transformers';

// Embeddings are computed on the server's own CPU: no API key, no quota, and the same text
// always gets the same vector. all-MiniLM-L6-v2 is small (about 23 MB quantized), fast, and
// good at matching short passages. The model is downloaded once and cached on disk; the
// container image downloads it while it is built (see apps/server/Dockerfile).
const MODEL = 'Xenova/all-MiniLM-L6-v2';
export const DIMENSIONS = 384;

export function loadEmbeddingModel() {
  return pipeline('feature-extraction', MODEL, { dtype: 'q8' });
}
