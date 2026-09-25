import { logger } from '../logger.js';

const TICK_MS = 30_000;

// Periodic housekeeping: close incidents whose alerts went quiet, and catch "resolved"
// notifications that never arrived by comparing with Alertmanager's own list.
export function startLifecycle({ incidents, alertmanagerUrl }) {
  async function tick() {
    try {
      await incidents.resolveQuietIncidents();
      const active = await activeFingerprints(alertmanagerUrl);
      if (active) {
        const fixed = await incidents.reconcile(active);
        if (fixed > 0) logger.info({ alerts: fixed }, 'resolved alerts that Alertmanager no longer reports');
      }
    } catch (err) {
      logger.error({ err }, 'incident housekeeping failed');
    }
  }

  const timer = setInterval(tick, TICK_MS);
  return { stop: () => clearInterval(timer), tick };
}

async function activeFingerprints(baseUrl) {
  try {
    const url = new URL('/api/v2/alerts?active=true&silenced=true&inhibited=true&unprocessed=true', baseUrl);
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const alerts = await res.json();
    return alerts.map((alert) => alert.fingerprint);
  } catch (err) {
    // Without Alertmanager's view we can't tell stale from firing, so skip this round.
    logger.debug({ err: err.message }, 'Alertmanager unreachable, skipping reconciliation');
    return null;
  }
}
