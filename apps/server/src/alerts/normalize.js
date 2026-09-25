import { z } from 'zod';
import { SEVERITIES } from './severity.js';

const timestamp = z.string().refine((value) => !Number.isNaN(Date.parse(value)), 'not a valid timestamp');

// The part of Alertmanager's webhook payload (version 4) that OpsPilot relies on.
export const alertmanagerPayload = z.object({
  status: z.enum(['firing', 'resolved']),
  alerts: z
    .array(
      z.object({
        status: z.enum(['firing', 'resolved']),
        labels: z.record(z.string(), z.string()),
        annotations: z.record(z.string(), z.string()).default({}),
        startsAt: timestamp,
        endsAt: timestamp.optional(),
        fingerprint: z.string().min(1),
      }),
    )
    .max(1000),
});

export function normalizeAlert(raw) {
  const { alertname, service, severity } = raw.labels;
  return {
    fingerprint: raw.fingerprint,
    name: alertname ?? 'UnnamedAlert',
    service: service ?? 'unknown',
    severity: SEVERITIES.includes(severity) ? severity : 'warning',
    status: raw.status,
    summary: raw.annotations.summary ?? raw.annotations.description ?? '',
    labels: raw.labels,
    startsAt: new Date(raw.startsAt),
    endsAt: raw.status === 'resolved' && raw.endsAt ? new Date(raw.endsAt) : null,
  };
}
