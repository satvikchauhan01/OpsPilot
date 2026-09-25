import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { alertmanagerPayload, normalizeAlert } from '../src/alerts/normalize.js';

const payload = {
  version: '4',
  status: 'firing',
  receiver: 'opspilot',
  alerts: [
    {
      status: 'firing',
      labels: { alertname: 'HighErrorRate', service: 'checkout', severity: 'critical' },
      annotations: { summary: 'checkout is failing 19% of requests' },
      startsAt: '2026-09-25T15:12:03.123456789Z',
      endsAt: '0001-01-01T00:00:00Z',
      fingerprint: 'c0ffee',
    },
    {
      status: 'resolved',
      labels: { alertname: 'Custom' },
      annotations: {},
      startsAt: '2026-09-25T15:00:00Z',
      endsAt: '2026-09-25T15:05:00Z',
      fingerprint: 'beef',
    },
  ],
};

describe('Alertmanager payloads', () => {
  it('accepts the webhook format, including nanosecond timestamps', () => {
    const parsed = alertmanagerPayload.parse(payload);
    const firing = normalizeAlert(parsed.alerts[0]);
    assert.equal(firing.service, 'checkout');
    assert.equal(firing.startsAt.toISOString(), '2026-09-25T15:12:03.123Z');
    assert.equal(firing.endsAt, null);
  });

  it('fills in defaults for alerts without service or severity labels', () => {
    const resolved = normalizeAlert(alertmanagerPayload.parse(payload).alerts[1]);
    assert.equal(resolved.service, 'unknown');
    assert.equal(resolved.severity, 'warning');
    assert.equal(resolved.endsAt.toISOString(), '2026-09-25T15:05:00.000Z');
  });

  it('rejects payloads without a fingerprint', () => {
    const broken = { ...payload, alerts: [{ ...payload.alerts[0], fingerprint: '' }] };
    assert.equal(alertmanagerPayload.safeParse(broken).success, false);
  });
});
