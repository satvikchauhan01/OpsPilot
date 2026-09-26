import { setTimeout as sleep } from 'node:timers/promises';
import { logger } from '../logger.js';
import { DIMENSIONS } from './embeddings.js';

const READY_TIMEOUT_MS = 3 * 60_000;

/**
 * Makes sure an Atlas Vector Search index exists on the model's `embedding` field, with the
 * given filter fields, and waits until it can answer queries. Creating one on a fresh cluster
 * takes Atlas a minute or so. The free M0 tier allows three search indexes, OpsPilot uses two.
 */
export async function ensureVectorIndex(Model, { name, filters = [] }) {
  const definition = {
    fields: [
      { type: 'vector', path: 'embedding', numDimensions: DIMENSIONS, similarity: 'cosine' },
      ...filters.map((path) => ({ type: 'filter', path })),
    ],
  };

  // Search indexes can only be created on a collection that exists.
  await Model.createCollection();
  const collection = Model.db.db.collection(Model.collection.collectionName);
  const existing = (await collection.listSearchIndexes().toArray()).find((index) => index.name === name);

  if (!existing) {
    logger.info({ index: name }, 'creating the vector search index');
    await collection.createSearchIndex({ name, type: 'vectorSearch', definition });
  } else if (!sameFields(existing.latestDefinition?.fields ?? [], definition.fields)) {
    logger.info({ index: name }, 'updating the vector search index');
    await collection.updateSearchIndex(name, definition);
  }

  const deadline = Date.now() + READY_TIMEOUT_MS;
  for (;;) {
    const index = (await collection.listSearchIndexes().toArray()).find((candidate) => candidate.name === name);
    if (index?.queryable && index.status === 'READY') return;
    if (index?.status === 'FAILED') throw new Error(`vector index ${name} failed to build: ${index.message ?? ''}`);
    if (Date.now() > deadline) throw new Error(`vector index ${name} is still not ready after 3 minutes`);
    await sleep(3000);
  }
}

// Atlas adds defaults to the definitions it returns, so compare only what we asked for.
function sameFields(actual, wanted) {
  const key = (field) => `${field.type}:${field.path}:${field.numDimensions ?? ''}:${field.similarity ?? ''}`;
  const have = new Set(actual.map(key));
  return actual.length === wanted.length && wanted.every((field) => have.has(key(field)));
}

/**
 * Atlas indexes new documents a few seconds after they are written. Waits until a search for
 * `vector` returns a hit that `isMatch` recognises, so searches right after a write don't come
 * back empty.
 */
export async function waitUntilSearchable(Model, { index, vector, isMatch }) {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    const [hit] = await vectorSearch(Model, { index, vector, limit: 1 });
    if (hit && isMatch(hit)) return;
    await sleep(1000);
  }
  logger.warn({ index }, 'new documents are still not searchable after a minute');
}

/**
 * Nearest neighbours of `vector` in the model's collection, best first, without their
 * embeddings. Atlas reports cosine similarity rescaled to 0..1; `similarity` undoes that, so
 * 1 means identical and 0 means unrelated.
 */
export async function vectorSearch(Model, { index, vector, limit, filter }) {
  const hits = await Model.aggregate([
    {
      $vectorSearch: {
        index,
        path: 'embedding',
        queryVector: vector,
        numCandidates: Math.max(100, limit * 20),
        limit,
        ...(filter && { filter }),
      },
    },
    { $set: { score: { $meta: 'vectorSearchScore' } } },
    { $unset: ['embedding', '__v'] },
  ]);
  return hits.map(({ score, ...hit }) => ({ ...hit, similarity: Math.max(0, 2 * score - 1) }));
}
