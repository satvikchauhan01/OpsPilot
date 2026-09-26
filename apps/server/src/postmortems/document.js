import { z } from 'zod';
import { causeWords, sentence } from '../knowledge/text.js';

const PRIORITIES = ['high', 'medium', 'low'];

// The parts of a postmortem that take judgement. Everything factual (times, duration,
// services, the timeline, the fix) is filled in from the incident's own data instead.
const narrativeSchema = z.object({
  summary: z.string().trim().min(20).max(1200),
  impact: z.string().trim().min(10).max(800),
  rootCause: z.string().trim().min(20).max(1500),
  resolution: z.string().trim().min(10).max(1000),
  wentWell: z.array(z.string().trim().min(3).max(300)).min(1).max(6),
  wentBadly: z.array(z.string().trim().min(3).max(300)).min(1).max(6),
  actionItems: z
    .array(z.object({ title: z.string().trim().min(5).max(300), priority: z.enum(PRIORITIES) }))
    .min(1)
    .max(6),
});

// The same contract as JSON Schema, for the model's submit_postmortem tool.
export const NARRATIVE_PARAMETERS = {
  type: 'object',
  properties: {
    summary: { type: 'string', description: 'Two to four sentences: what happened, why, and how it ended.' },
    impact: { type: 'string', description: 'Who and what was affected, and how badly, from the facts given.' },
    rootCause: { type: 'string', description: 'The root cause and how it led to the symptoms.' },
    resolution: { type: 'string', description: 'What was done to end the incident, and how it was confirmed.' },
    wentWell: { type: 'array', items: { type: 'string' }, description: 'What helped, one point each.' },
    wentBadly: { type: 'array', items: { type: 'string' }, description: 'What made it worse or slower.' },
    actionItems: {
      type: 'array',
      description: 'Concrete follow-ups for this incident, not general advice.',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          priority: { type: 'string', enum: PRIORITIES },
        },
        required: ['title', 'priority'],
      },
    },
  },
  required: ['summary', 'impact', 'rootCause', 'resolution', 'wentWell', 'wentBadly', 'actionItems'],
};

export function parseNarrative(args) {
  const parsed = narrativeSchema.safeParse(args);
  return parsed.success
    ? { ok: true, narrative: parsed.data }
    : { ok: false, error: parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ') };
}

// A draft for people to finish when no model could write one.
export function templateNarrative(facts) {
  const cause = facts.rootCause
    ? `The investigation found ${causeWords(facts.rootCause.causeType)} in ${facts.rootCause.service}: ${sentence(facts.rootCause.title)}`
    : 'No root cause was established.';
  return {
    summary: `${sentence(facts.title)} ${cause} ${facts.fix ? sentence(facts.fix) : ''}`.trim(),
    impact: `${facts.services.join(', ')} ${facts.services.length > 1 ? 'were' : 'was'} affected for ${facts.duration}.`,
    rootCause: facts.rootCause ? sentence(facts.rootCause.title) : 'To be written.',
    resolution: facts.fix ? sentence(facts.fix) : 'To be written.',
    wentWell: ['To be written.'],
    wentBadly: ['To be written.'],
    actionItems: [{ title: 'To be decided by the team.', priority: 'medium' }],
  };
}

/**
 * The postmortem as Markdown: facts from the incident's data around the narrative. The
 * structure is fixed, so every postmortem reads the same way and its sections can be found
 * again (see sectionOf).
 */
export function composePostmortem(facts, narrative, { draftedBy }) {
  const peaks = facts.peaks.map(
    ({ service, errorRate, p95 }) =>
      `- ${service}: up to ${percent(errorRate)} of requests failed${p95 === null ? '' : `, p95 latency up to ${seconds(p95)}`}`,
  );
  return [
    `# Postmortem: ${facts.id} ${facts.title}`,
    '',
    `- **Severity:** ${facts.severity}`,
    `- **Started:** ${facts.startedAt} UTC`,
    `- **Resolved:** ${facts.resolvedAt} UTC, after ${facts.duration}`,
    `- **Services:** ${facts.services.map((service) => (service === facts.origin ? `${service} (where it started)` : service)).join(', ')}`,
    `- **Root cause:** ${facts.rootCause ? `${causeWords(facts.rootCause.causeType)} in ${facts.rootCause.service}` : 'not established'}`,
    `- **Fix:** ${facts.fix ?? 'none recorded'}`,
    '',
    '## Summary',
    '',
    narrative.summary,
    '',
    '## Impact',
    '',
    narrative.impact,
    ...(peaks.length > 0 ? ['', ...peaks] : []),
    '',
    '## Timeline',
    '',
    ...facts.timeline.map(({ time, text }) => `- ${time} UTC · ${text}`),
    '',
    '## Root cause',
    '',
    narrative.rootCause,
    '',
    '## Resolution',
    '',
    narrative.resolution,
    '',
    '## What went well',
    '',
    ...narrative.wentWell.map((item) => `- ${item}`),
    '',
    '## What went badly',
    '',
    ...narrative.wentBadly.map((item) => `- ${item}`),
    '',
    '## Action items',
    '',
    ...narrative.actionItems.map(({ title, priority }) => `- [ ] ${title} (${priority})`),
    '',
    `_Drafted by ${draftedBy} from the incident's timeline, investigation and fix._`,
    '',
  ].join('\n');
}

// The text of one "## " section, e.g. the summary for incident memory. People edit the
// document, so the heading is matched loosely.
export function sectionOf(markdown, heading) {
  const lines = markdown.replace(/\r\n?/g, '\n').split('\n');
  const wanted = `## ${heading}`.toLowerCase();
  const start = lines.findIndex((line) => line.trim().toLowerCase() === wanted);
  if (start === -1) return '';
  const end = lines.findIndex((line, i) => i > start && line.startsWith('## '));
  return lines
    .slice(start + 1, end === -1 ? undefined : end)
    .join('\n')
    .trim();
}

function percent(ratio) {
  return `${Math.round(ratio * 100)}%`;
}

function seconds(value) {
  return value < 1 ? `${Math.round(value * 1000)} ms` : `${value.toFixed(1)} s`;
}
