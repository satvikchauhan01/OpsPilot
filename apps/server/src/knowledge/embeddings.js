import { pipeline } from '@huggingface/transformers';
import { logger } from '../logger.js';

// Embeddings are computed on the server's own CPU: no API key, no quota, and the same text
// always gets the same vector. all-MiniLM-L6-v2 is small (about 23 MB quantized), fast, and
// good at matching short passages. The model is downloaded once and cached on disk.
const MODEL = 'Xenova/all-MiniLM-L6-v2';
export const DIMENSIONS = 384;

let loading = null;

function loadModel() {
  loading ??= pipeline('feature-extraction', MODEL, { dtype: 'q8' })
    .then((extractor) => {
      logger.info({ model: MODEL }, 'embedding model loaded');
      return extractor;
    })
    .catch((err) => {
      // Let the next call try again, for example after a failed download.
      loading = null;
      throw err;
    });
  return loading;
}

// Vectors come back with unit length, so a dot product between two of them is their
// cosine similarity.
export async function embed(texts) {
  if (texts.length === 0) return [];
  const extractor = await loadModel();
  const output = await extractor(texts, { pooling: 'mean', normalize: true });
  return output.tolist();
}

export async function embedOne(text) {
  const [vector] = await embed([text]);
  return vector;
}
