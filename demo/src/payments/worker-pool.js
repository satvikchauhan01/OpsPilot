const client = require('prom-client');
const { register } = require('../lib/metrics');
const { HttpError } = require('../lib/errors');

// A fixed number of slots. Callers queue for a free one and give up after maxWaitMs.
class WorkerPool {
  #busy = 0;
  #waiting = [];

  constructor({ size, maxWaitMs }) {
    this.size = size;
    this.maxWaitMs = maxWaitMs;

    const pool = this;
    new client.Gauge({
      name: 'worker_pool_size',
      help: 'Processor connections this pod may hold',
      registers: [register],
      collect() {
        this.set(pool.size);
      },
    });
    new client.Gauge({
      name: 'worker_pool_busy',
      help: 'Processor connections currently in use',
      registers: [register],
      collect() {
        this.set(pool.#busy);
      },
    });
    new client.Gauge({
      name: 'worker_queue_depth',
      help: 'Charges waiting for a free processor connection',
      registers: [register],
      collect() {
        this.set(pool.#waiting.length);
      },
    });
    this.rejected = new client.Counter({
      name: 'worker_pool_rejected_total',
      help: 'Charges rejected because no connection freed up in time',
      registers: [register],
    });
  }

  async run(task) {
    if (this.#busy < this.size) this.#busy++;
    else await this.#waitForTurn();

    try {
      return await task();
    } finally {
      this.#release();
    }
  }

  #waitForTurn() {
    return new Promise((resolve, reject) => {
      const entry = {
        resolve,
        timer: setTimeout(() => {
          this.#waiting.splice(this.#waiting.indexOf(entry), 1);
          this.rejected.inc();
          reject(new HttpError(503, 'payment processor busy, try again'));
        }, this.maxWaitMs),
      };
      this.#waiting.push(entry);
    });
  }

  // A finished task hands its slot straight to the next caller in line. Freeing the slot
  // first would let a newcomer grab it too, and the pool would end up overbooked.
  #release() {
    const next = this.#waiting.shift();
    if (next) {
      clearTimeout(next.timer);
      next.resolve();
    } else {
      this.#busy--;
    }
  }
}

module.exports = { WorkerPool };
