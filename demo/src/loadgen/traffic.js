const logger = require('../lib/logger');

const SKUS = ['MUG-001', 'TEE-014', 'CAP-007', 'BAG-021', 'SOX-003', 'BTL-009'];

// Two live codes, plus three expired ones that customers still paste in from old emails.
const COUPONS = ['SPRING10', 'FREESHIP', 'WINTER25', 'WELCOME5', 'BLACKFRIDAY'];
const COUPON_SHARE = 0.4;

const TICK_MS = 100;
const MAX_IN_FLIGHT = 300;
const REQUEST_TIMEOUT_MS = 10_000;
const REPORT_INTERVAL_MS = 30_000;
const DEFAULT_SURGE_SEC = 20 * 60;

class Traffic {
  #budget = 0;
  #surgeTimer = null;
  #inFlight = 0;

  constructor({ target, baseline }) {
    this.target = target;
    this.baseline = baseline;
    this.profile = { ...baseline };
    this.surgeEndsAt = null;
    this.stats = { sent: 0, ok: 0, rejected: 0, failed: 0, dropped: 0 };
  }

  start() {
    setInterval(() => this.#tick(), TICK_MS);
    setInterval(() => this.#report(), REPORT_INTERVAL_MS);
  }

  surge({ rps, checkoutShare, durationSec = DEFAULT_SURGE_SEC } = {}) {
    clearTimeout(this.#surgeTimer);
    this.profile = {
      rps: Number(rps) || this.baseline.rps * 6,
      checkoutShare: Number(checkoutShare) || this.baseline.checkoutShare,
    };
    this.surgeEndsAt = new Date(Date.now() + durationSec * 1000);
    this.#surgeTimer = setTimeout(() => this.reset(), durationSec * 1000);
    logger.info({ ...this.profile, durationSec }, 'traffic surge started');
  }

  reset() {
    clearTimeout(this.#surgeTimer);
    this.profile = { ...this.baseline };
    this.surgeEndsAt = null;
    logger.info(this.profile, 'traffic back to baseline');
  }

  status() {
    return {
      target: this.target,
      profile: this.profile,
      surgeEndsAt: this.surgeEndsAt,
      inFlight: this.#inFlight,
      stats: this.stats,
    };
  }

  #tick() {
    // Carry fractional requests over between ticks so low rates still average out right.
    this.#budget += (this.profile.rps * TICK_MS) / 1000;
    while (this.#budget >= 1) {
      this.#budget -= 1;
      if (this.#inFlight >= MAX_IN_FLIGHT) {
        this.stats.dropped++;
        continue;
      }
      const request = Math.random() < this.profile.checkoutShare ? checkoutRequest() : browseRequest();
      this.#send(request);
    }
  }

  async #send({ method, path, body }) {
    this.#inFlight++;
    this.stats.sent++;
    try {
      const res = await fetch(`${this.target}${path}`, {
        method,
        headers: body ? { 'content-type': 'application/json' } : undefined,
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      await res.arrayBuffer();

      if (res.ok) this.stats.ok++;
      else if (res.status < 500) this.stats.rejected++;
      else this.stats.failed++;
    } catch {
      this.stats.failed++;
    } finally {
      this.#inFlight--;
    }
  }

  #report() {
    logger.info({ ...this.stats, inFlight: this.#inFlight, rps: this.profile.rps }, 'traffic report');
  }
}

function browseRequest() {
  return { method: 'GET', path: '/api/products' };
}

function checkoutRequest() {
  const skus = shuffle(SKUS).slice(0, 1 + randomInt(3));
  const order = {
    customerId: `cust-${randomInt(5000)}`,
    items: skus.map((sku) => ({ sku, qty: 1 + randomInt(2) })),
  };
  if (Math.random() < COUPON_SHARE) order.coupon = COUPONS[randomInt(COUPONS.length)];
  return { method: 'POST', path: '/api/checkout', body: order };
}

function randomInt(max) {
  return Math.floor(Math.random() * max);
}

function shuffle(items) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

module.exports = { Traffic };
