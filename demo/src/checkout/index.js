const { randomUUID } = require('node:crypto');
const logger = require('../lib/logger');
const { createService } = require('../lib/service');
const { callService } = require('../lib/http-client');
const { HttpError } = require('../lib/errors');
const { priceOrder } = require('./pricing');

createService({
  routes(app) {
    app.post('/orders', async (req, res) => {
      const { customerId, items, coupon } = parseOrder(req.body);

      const reservation = await callService('inventory', '/reservations', {
        method: 'POST',
        body: { items },
        timeoutMs: 1000,
      });
      const price = priceOrder(reservation.lines, coupon);

      const orderId = randomUUID();
      const charge = await callService('payments', '/charges', {
        method: 'POST',
        body: { orderId, customerId, amount: price.total },
        timeoutMs: 2000,
      });

      logger.info({ orderId, total: price.total, chargeId: charge.chargeId }, 'order placed');
      res.status(201).json({ orderId, status: 'confirmed', ...price, chargeId: charge.chargeId });
    });
  },
});

function parseOrder(body) {
  const { customerId, items, coupon } = body ?? {};

  if (typeof customerId !== 'string' || !Array.isArray(items) || items.length === 0) {
    throw new HttpError(400, 'an order needs a customerId and at least one item');
  }
  for (const item of items) {
    if (typeof item?.sku !== 'string' || !Number.isInteger(item.qty) || item.qty < 1) {
      throw new HttpError(400, 'every item needs a sku and a positive whole qty');
    }
  }
  if (coupon !== undefined && typeof coupon !== 'string') {
    throw new HttpError(400, 'coupon must be a string');
  }

  return { customerId, items, coupon };
}
