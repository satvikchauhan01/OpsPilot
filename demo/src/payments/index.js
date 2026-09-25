const { randomUUID } = require('node:crypto');
const { setTimeout: sleep } = require('node:timers/promises');
const { createService } = require('../lib/service');
const { HttpError } = require('../lib/errors');
const { WorkerPool } = require('./worker-pool');

// Each pod can only hold a couple of connections to the card processor at once.
// A traffic spike runs into this limit (scenario S4), and adding pods is what fixes it.
const processor = new WorkerPool({
  size: Number(process.env.PROCESSOR_CONNECTIONS) || 2,
  maxWaitMs: Number(process.env.QUEUE_TIMEOUT_MS) || 1500,
});

const DECLINE_RATE = 0.01;

createService({
  routes(app) {
    app.post('/charges', async (req, res) => {
      const { orderId, amount } = req.body ?? {};
      if (typeof orderId !== 'string' || !(amount > 0)) {
        throw new HttpError(400, 'a charge needs an orderId and a positive amount');
      }

      const charge = await processor.run(() => authorize(orderId, amount));
      res.status(201).json(charge);
    });
  },
});

// Stands in for the round trip to the card processor.
async function authorize(orderId, amount) {
  await sleep(80 + Math.random() * 80);
  if (Math.random() < DECLINE_RATE) throw new HttpError(402, 'card declined');
  return { chargeId: randomUUID(), orderId, amount, status: 'captured' };
}
