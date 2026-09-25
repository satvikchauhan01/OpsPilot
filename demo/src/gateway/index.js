const { createService } = require('../lib/service');
const { callService } = require('../lib/http-client');

// The public edge of the shop. It owns no data and only forwards requests to the
// services behind it.
createService({
  routes(app) {
    app.get('/api/products', async (req, res) => {
      res.json(await callService('inventory', '/stock', { timeoutMs: 1000 }));
    });

    app.post('/api/checkout', async (req, res) => {
      // checkout can spend up to 3s on its own downstream calls, so wait a little longer
      const order = await callService('checkout', '/orders', {
        method: 'POST',
        body: req.body,
        timeoutMs: 3500,
      });
      res.status(201).json(order);
    });
  },
});
