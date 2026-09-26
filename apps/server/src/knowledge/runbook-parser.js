import { parse as parseYaml } from 'yaml';
import { z } from 'zod';
import { CAUSE_TYPES } from '../investigation/findings.js';
import { ACTION_TYPES } from '../remediation/catalog.js';
import { plainText, wordCount } from './text.js';

// all-MiniLM-L6-v2 reads at most 256 word pieces. 160 words leaves room for the title line
// that starts every chunk.
const MAX_CHUNK_WORDS = 160;

const FRONT_MATTER = /^---\n([\s\S]*?)\n---\n/;

const metadataSchema = z.object({
  owner: z.string().trim().min(1).optional(),
  services: z.array(z.string()).default([]),
  alerts: z.array(z.string()).default([]),
  causes: z.array(z.enum(CAUSE_TYPES)).default([]),
  // The fixes from OpsPilot's catalog this runbook recommends, each with the heading of the
  // section that explains it, e.g. `rollback: Roll back`
  actions: z.partialRecord(z.enum(ACTION_TYPES), z.string().trim().min(1)).default({}),
});

/**
 * Reads one runbook: YAML front matter, a "# Title" line, an introduction and "## " sections.
 * Throws with a readable message when the file doesn't have that shape.
 */
export function parseRunbook(source, slug) {
  const text = source.replace(/\r\n?/g, '\n');
  const front = text.match(FRONT_MATTER);
  const metadata = metadataSchema.safeParse(front ? (parseYaml(front[1]) ?? {}) : {});
  if (!metadata.success) {
    const problems = metadata.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`);
    throw new Error(`${slug}: ${problems.join('; ')}`);
  }

  const body = front ? text.slice(front[0].length) : text;
  const title = body.match(/^# (.+)$/m);
  if (!title) throw new Error(`${slug}: a runbook needs a "# Title" line`);

  const intro = [];
  const sections = [];
  let inFence = false;
  for (const line of body.slice(title.index + title[0].length).split('\n')) {
    if (/^\s*(```|~~~)/.test(line)) inFence = !inFence;
    const heading = !inFence && line.match(/^## (.+)$/);
    if (heading) sections.push({ heading: heading[1].trim(), lines: [] });
    else (sections.at(-1)?.lines ?? intro).push(line);
  }
  if (sections.length === 0) throw new Error(`${slug}: a runbook needs at least one "## " section`);

  const introMarkdown = intro.join('\n').trim();
  const anchors = new Set(['overview']);
  const parsedSections = sections.map(({ heading, lines }) => ({
    anchor: uniqueAnchor(heading, anchors),
    heading,
    markdown: lines.join('\n').trim(),
  }));

  const actions = Object.entries(metadata.data.actions).map(([action, heading]) => {
    const section = parsedSections.find((candidate) => candidate.heading === heading);
    if (!section) throw new Error(`${slug}: actions.${action} points at "${heading}", which is not a section`);
    return { action, heading, anchor: section.anchor };
  });

  return {
    slug,
    title: title[1].trim(),
    summary: plainText(introMarkdown).split('\n\n')[0] ?? '',
    ...metadata.data,
    actions,
    intro: introMarkdown,
    sections: parsedSections,
  };
}

/**
 * Splits a parsed runbook into the pieces that get embedded: the introduction and every
 * section, with long sections cut at paragraph boundaries. Each chunk starts with the runbook
 * title and the section heading, so it still makes sense on its own. (Adding the alert names
 * as well made matching worse: every runbook that mentions error rates started to look alike.)
 */
export function chunkRunbook(runbook) {
  const parts = [{ anchor: 'overview', heading: 'Overview', markdown: runbook.intro }, ...runbook.sections];

  return parts.flatMap(({ anchor, heading, markdown }) =>
    splitParagraphs(plainText(markdown), MAX_CHUNK_WORDS).map((text, part) => ({
      slug: runbook.slug,
      title: runbook.title,
      anchor,
      heading,
      part,
      text,
      services: runbook.services,
      causes: runbook.causes,
      embeddingText: `${runbook.title}: ${heading}.\n${text}`,
    })),
  );
}

function splitParagraphs(text, maxWords) {
  const chunks = [];
  let current = [];
  let words = 0;
  for (const paragraph of text.split('\n\n').filter(Boolean)) {
    const size = wordCount(paragraph);
    if (current.length > 0 && words + size > maxWords) {
      chunks.push(current.join('\n\n'));
      current = [];
      words = 0;
    }
    current.push(paragraph);
    words += size;
  }
  if (current.length > 0) chunks.push(current.join('\n\n'));
  return chunks;
}

function uniqueAnchor(heading, used) {
  const base =
    heading
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'section';
  let anchor = base;
  for (let n = 2; used.has(anchor); n += 1) anchor = `${base}-${n}`;
  used.add(anchor);
  return anchor;
}
