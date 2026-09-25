const express = require('express');
const logger = require('../lib/logger');
const { Traffic } = require('./traffic');

const traffic = new Traffic({
  target: process.env.TARGET_URL || 'http://gateway.shop.svc.cluster.local',
  baseline: {
    rps: Number(process.env.BASE_RPS) || 8,
    checkoutShare: Number(process.env.CHECKOUT_SHARE) || 0.4,
  },
});
traffic.start();

// A small control API, used by the traffic-spike scenario.
const app = express();
app.use(express.json());

app.get('/healthz', (req, res) => res.json({ status: 'ok' }));
app.get('/control', (req, res) => res.json(traffic.status()));
app.post('/control', (req, res) => {
  traffic.surge(req.body);
  res.json(traffic.status());
});
app.delete('/control', (req, res) => {
  traffic.reset();
  res.json(traffic.status());
});

const port = Number(process.env.PORT) || 8080;
app.listen(port, () => logger.info({ port, target: traffic.target }, 'load generator started'));

process.once('SIGTERM', () => process.exit(0));
