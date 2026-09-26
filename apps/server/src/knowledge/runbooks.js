import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { Runbook } from '../models/runbook.js';
import { RunbookChunk } from '../models/runbook-chunk.js';
import { HttpError, notFound } from '../http/errors.js';
import { logger } from '../logger.js';
import { embed, embedOne } from './embeddings.js';
import { ensureVectorIndex, vectorSearch, waitUntilSearchable } from './vector-index.js';
import { chunkRunbook, parseRunbook } from './runbook-parser.js';
import { incidentDescription } from './context.js';

const INDEX = 'runbook_chunks';
// Part of every runbook's fingerprint. Bump it when chunking or embedding changes, and every
// runbook gets indexed again on the next start.
const INDEX_VERSION = 4;

export function createRunbookService({ dir, namespace }) {
  let ready = false;

  // Brings Atlas in line with the Markdown files: new and edited runbooks are chunked and
  // embedded, deleted ones are removed, and unchanged ones are left alone.
  async function sync() {
    await ensureVectorIndex(RunbookChunk, { name: INDEX, filters: ['services', 'causes'] });

    const files = (await readdir(dir)).filter((file) => file.endsWith('.md')).sort();
    const slugs = files.map((file) => path.basename(file, '.md'));
    let indexed = 0;
    let lastWritten = null;

    for (const [i, file] of files.entries()) {
      const slug = slugs[i];
      const source = await readFile(path.join(dir, file), 'utf8');
      const hash = createHash('sha256').update(`${INDEX_VERSION}\n${source}`).digest('hex');
      if (await Runbook.exists({ slug, hash })) continue;

      let runbook;
      try {
        runbook = parseRunbook(source, slug);
      } catch (err) {
        // A broken edit keeps the last good version searchable.
        logger.warn({ file, err: err.message }, 'skipping a runbook that could not be read');
        continue;
      }

      const chunks = chunkRunbook(runbook);
      const vectors = await embed(chunks.map((chunk) => chunk.embeddingText));
      await RunbookChunk.deleteMany({ slug });
      await RunbookChunk.insertMany(
        chunks.map(({ embeddingText, ...chunk }, n) => ({ ...chunk, embedding: vectors[n] })),
      );
      await Runbook.replaceOne({ slug }, { ...runbook, hash, indexedAt: new Date() }, { upsert: true });
      indexed += 1;
      lastWritten = { slug, vector: vectors[0] };
    }

    await Promise.all([
      Runbook.deleteMany({ slug: { $nin: slugs } }),
      RunbookChunk.deleteMany({ slug: { $nin: slugs } }),
    ]);
    if (lastWritten) {
      await waitUntilSearchable(RunbookChunk, {
        index: INDEX,
        vector: lastWritten.vector,
        isMatch: (hit) => hit.slug === lastWritten.slug,
      });
    }
    ready = true;
    return { runbooks: slugs.length, indexed };
  }

  async function list() {
    return Runbook.find({}, '-_id -intro -sections.markdown -hash').sort({ title: 1 }).lean();
  }

  async function get(slug) {
    const runbook = await Runbook.findOne({ slug }, '-_id -hash').lean();
    if (!runbook) throw notFound('runbook');
    return runbook;
  }

  // The sections closest in meaning to `query`, best first, each section at most once even
  // when it was split into several chunks. `service` and `cause` narrow the search to the
  // runbooks written for them.
  async function search(query, { limit = 5, service, cause } = {}) {
    if (!ready) throw new HttpError(503, 'runbooks are still being indexed, try again in a moment');

    const conditions = [service && { services: service }, cause && { causes: cause }].filter(Boolean);
    const hits = await vectorSearch(RunbookChunk, {
      index: INDEX,
      vector: await embedOne(query),
      limit: limit * 2,
      filter: conditions.length > 1 ? { $and: conditions } : conditions[0],
    });

    const sections = new Map();
    for (const hit of hits) {
      const key = `${hit.slug}#${hit.anchor}`;
      if (!sections.has(key)) sections.set(key, hit);
    }
    return [...sections.values()].slice(0, limit).map(({ slug, title, anchor, heading, text, similarity }) => ({
      slug,
      title,
      anchor,
      heading,
      text,
      similarity,
    }));
  }

  // The runbook search an investigation opens with.
  async function openingQuery(incident) {
    return (await incidentDescription(incident, namespace, { withRootCause: false })).text;
  }

  // The sections shown on an incident. Once the root cause is known, only runbooks written for
  // that kind of cause are searched, as long as there are any.
  async function forIncident(incident) {
    const { text, rootCause } = await incidentDescription(incident, namespace, { withRootCause: true });
    if (rootCause) {
      const matching = await search(text, { limit: 5, cause: rootCause.causeType });
      if (matching.length > 0) return matching;
    }
    return search(text, { limit: 5 });
  }

  // The runbooks written for a cause that recommend a fix, the best match for the incident
  // first. Each lists its fixes with the section that explains them.
  async function fixesFor(incident, causeType) {
    const candidates = await Runbook.find(
      { causes: causeType, 'actions.0': { $exists: true } },
      '-_id slug title actions',
    ).lean();
    if (candidates.length < 2) return candidates;

    const ranked = [...new Set((await forIncident(incident).catch(() => [])).map((hit) => hit.slug))];
    const rank = (slug) => (ranked.includes(slug) ? ranked.indexOf(slug) : ranked.length);
    return candidates.sort((a, b) => rank(a.slug) - rank(b.slug));
  }

  return { sync, list, get, search, openingQuery, forIncident, fixesFor };
}
