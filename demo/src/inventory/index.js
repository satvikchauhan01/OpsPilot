const { randomUUID } = require('node:crypto');
const { createService } = require('../lib/service');
const { HttpError } = require('../lib/errors');
const { Catalog } = require('./catalog');

const catalog = new Catalog();

createService({
  routes(app) {
    app.get('/stock', (req, res) => {
      res.json(catalog.list());
    });

    app.post('/reservations', (req, res) => {
      const items = req.body?.items;
      if (!Array.isArray(items) || items.length === 0) {
        throw new HttpError(400, 'nothing to reserve');
      }

      const lines = catalog.reserve(items);
      res.status(201).json({ reservationId: randomUUID(), lines });
    });
  },
});
