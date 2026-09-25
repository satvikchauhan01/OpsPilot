import { setTimeout as sleep } from 'node:timers/promises';

const WINDOW_MS = 60_000;

// Sliding-window limiter: at most `perMinute` calls start in any 60 seconds. Callers wait
// their turn rather than getting rejected, which suits a single background worker.
export function createRateLimiter(perMinute, now = () => Date.now()) {
  const started = [];

  return async function waitForSlot() {
    for (;;) {
      const cutoff = now() - WINDOW_MS;
      while (started.length > 0 && started[0] <= cutoff) started.shift();
      if (started.length < perMinute) {
        started.push(now());
        return;
      }
      await sleep(started[0] + WINDOW_MS - now() + 50);
    }
  };
}
