import { z } from 'zod';

export const CAUSE_TYPES = [
  'bad_deploy', // a new release introduced the problem
  'config_change', // a settings change introduced it
  'memory_leak', // memory keeps growing towards the limit
  'resource_saturation', // a fixed capacity (workers, connections, CPU) is used up
  'traffic_surge', // incoming load far above normal
  'slow_dependency', // the service is slow or hanging while waiting on something it calls
  'crash_loop', // containers keep crashing and restarting
  'unknown',
];

export const SUGGESTED_ACTIONS = ['rollback', 'restart', 'scale_up', 'investigate', 'none'];

const MAX_HYPOTHESES = 3;

const findingsSchema = z.object({
  summary: z.string().trim().min(10).max(1500),
  hypotheses: z
    .array(
      z.object({
        title: z.string().trim().min(5).max(200),
        service: z.string().trim().min(1),
        causeType: z.enum(CAUSE_TYPES),
        confidence: z.number().min(0).max(1),
        reasoning: z.string().trim().min(10).max(2500),
        evidence: z
          .array(
            z.object({
              id: z.string().regex(/^E\d+$/, 'evidence ids look like E3'),
              finding: z.string().trim().min(3).max(500),
            }),
          )
          .min(1, 'every hypothesis needs at least one piece of evidence')
          .max(8),
        suggestedAction: z.enum(SUGGESTED_ACTIONS),
      }),
    )
    .min(1)
    .max(MAX_HYPOTHESES),
});

// The same contract as JSON Schema, for the model's submit_findings tool.
export const FINDINGS_PARAMETERS = {
  type: 'object',
  properties: {
    summary: {
      type: 'string',
      description: 'Two or three sentences: what is happening and why, for the on-call engineer.',
    },
    hypotheses: {
      type: 'array',
      minItems: 1,
      maxItems: MAX_HYPOTHESES,
      description: 'Possible root causes, most likely first.',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'The root cause in one short sentence.' },
          service: { type: 'string', description: 'The service where the problem originates.' },
          causeType: { type: 'string', enum: CAUSE_TYPES },
          confidence: { type: 'number', minimum: 0, maximum: 1 },
          reasoning: {
            type: 'string',
            description: 'Why the evidence points here, and what rules out the alternatives.',
          },
          evidence: {
            type: 'array',
            minItems: 1,
            items: {
              type: 'object',
              properties: {
                id: { type: 'string', description: 'Evidence id such as E3.' },
                finding: { type: 'string', description: 'What this evidence shows, in one sentence.' },
              },
              required: ['id', 'finding'],
            },
          },
          suggestedAction: { type: 'string', enum: SUGGESTED_ACTIONS },
        },
        required: ['title', 'service', 'causeType', 'confidence', 'reasoning', 'evidence', 'suggestedAction'],
      },
    },
  },
  required: ['summary', 'hypotheses'],
};

// Checks the model's findings against the schema and against reality: the services must
// exist and every cited evidence id must be something this investigation actually looked at.
// Returns { ok: true, result } with hypotheses ranked by confidence, or { ok: false, error }
// with a message the model can act on.
export function validateFindings(args, { evidenceIds, services }) {
  const parsed = findingsSchema.safeParse(args);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; '),
    };
  }

  const problems = [];
  parsed.data.hypotheses.forEach((hypothesis, i) => {
    if (!services.includes(hypothesis.service)) {
      problems.push(`hypotheses.${i}.service "${hypothesis.service}" is not one of ${services.join(', ')}`);
    }
    for (const { id } of hypothesis.evidence) {
      if (!evidenceIds.has(id))
        problems.push(`hypotheses.${i} cites ${id}, which is not evidence from this investigation`);
    }
  });
  if (problems.length > 0) return { ok: false, error: problems.join('; ') };

  return {
    ok: true,
    result: {
      summary: parsed.data.summary,
      hypotheses: [...parsed.data.hypotheses].sort((a, b) => b.confidence - a.confidence),
    },
  };
}
