import { logger } from '../logger.js';
import { loadEmbeddingModel } from './embedding-model.js';

let loading = null;

function loadModel() {
  loading ??= loadEmbeddingModel()
    .then((extractor) => {
      logger.info('embedding model loaded');
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
