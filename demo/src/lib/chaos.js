const express = require('express');

// Runtime fault injection for the demo scenarios (scripts/scenario.mjs).
// Faults only live inside this process, so restarting the pod clears them, the same way
// a restart clears a real memory leak or a wedged connection pool.

// Stop leaking at 93% of the container limit (as RSS). The scenario is about a service that
// is degrading, not one that has already crashed, so it shouldn't get OOM-killed. The
// kernel's working-set figure reads a few points below RSS, so this settles around 85–88%,
// safely above the 80% alert threshold.
const LEAK_CEILING = 0.93;
const DEFAULT_DURATION_SEC = 30 * 60;

const faults = { latencyMs: 0, leakMbPerMin: 0 };
let leaked = [];
let leakedBytes = 0;
let leakTimer = null;
let expiryTimer = null;

function memoryLimit() {
  // Inside a container this is the cgroup limit. Outside one it is 0, so fall back to 512 MB.
  return process.constrainedMemory() || 512 * 1024 * 1024;
}

function startLeak(mbPerMin) {
  const bytesPerSecond = (mbPerMin * 1024 * 1024) / 60;

  leakTimer = setInterval(() => {
    if (process.memoryUsage().rss > memoryLimit() * LEAK_CEILING) return;

    // Many small live objects rather than one big Buffer. The garbage collector has to keep
    // walking all of them, which is what makes a leaking Node process slow down.
    const batch = [];
    for (let size = 0; size < bytesPerSecond; size += 128) {
      batch.push({ sku: `SKU-${size % 997}`, cachedAt: Date.now(), tags: ['stale'] });
    }
    leaked.push(batch);
    leakedBytes += bytesPerSecond;
  }, 1000);
}

function configure({ latencyMs = 0, leakMbPerMin = 0, durationSec = DEFAULT_DURATION_SEC } = {}) {
  clear();
  faults.latencyMs = Math.max(0, Number(latencyMs) || 0);
  faults.leakMbPerMin = Math.max(0, Number(leakMbPerMin) || 0);
  if (faults.leakMbPerMin > 0) startLeak(faults.leakMbPerMin);

  // Faults switch themselves off eventually, so a forgotten scenario can't break the demo forever.
  expiryTimer = setTimeout(clear, durationSec * 1000);
  expiryTimer.unref();
}

function clear() {
  clearInterval(leakTimer);
  clearTimeout(expiryTimer);
  leakTimer = null;
  expiryTimer = null;
  leaked = [];
  leakedBytes = 0;
  faults.latencyMs = 0;
  faults.leakMbPerMin = 0;
}

// Extra delay to add to each request, with some jitter so it looks organic on a chart.
function injectedDelay() {
  return faults.latencyMs ? faults.latencyMs * (0.8 + Math.random() * 0.4) : 0;
}

function status() {
  const mb = (bytes) => Math.round(bytes / 1024 / 1024);
  return {
    ...faults,
    leakedMb: mb(leakedBytes),
    rssMb: mb(process.memoryUsage().rss),
    limitMb: mb(memoryLimit()),
  };
}

const router = express.Router();
router.get('/', (req, res) => res.json(status()));
router.post('/', (req, res) => {
  configure(req.body);
  res.json(status());
});
// Responds with what was active before clearing, so the caller can tell whether memory leaked.
router.delete('/', (req, res) => {
  const cleared = status();
  clear();
  res.json(cleared);
});

module.exports = { router, injectedDelay };
