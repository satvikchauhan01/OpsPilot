const { setTimeout: sleep } = require('node:timers/promises');
const express = require('express');
const { trace, SpanStatusCode } = require('@opentelemetry/api');
const logger = require('./logger');
const chaos = require('./chaos');
const { register, trackRequests } = require('./metrics');
const { runShutdownHooks } = require('./lifecycle');

// Kubernetes stops routing to a terminating pod on its own, but kube-proxy on each node
// needs a moment to catch up. Serving a few more seconds after SIGTERM avoids dropping
// requests that were already on their way here.
const DRAIN_DELAY_MS = 5000;

// Callers keep their connections open between requests, and Kubernetes balances connections,
// not requests. Without a limit, pods added by a scale-out get almost no traffic: OpsPilot's
// verification caught exactly that in the traffic-spike scenario. Closing each connection
// after this many requests (the response says "Connection: close") makes callers reconnect
// now and then, and their new connections spread over every pod.
const REQUESTS_PER_CONNECTION = 50;

function createService({ routes, port = Number(process.env.PORT) || 8080 }) {
  const app = express();

  app.disable('x-powered-by');
  app.use(express.json());
  app.use(trackRequests);

  app.get('/healthz', (req, res) => res.json({ status: 'ok' }));
  app.get('/readyz', (req, res) => res.json({ status: 'ready' }));
  app.get('/metrics', async (req, res) => {
    res.type(register.contentType).send(await register.metrics());
  });
  app.use('/_chaos', chaos.router);

  // Registered after the internal endpoints, so probes and scrapes never see injected latency.
  app.use(async (req, res, next) => {
    const delay = chaos.injectedDelay();
    if (delay) await sleep(delay);
    next();
  });

  routes(app);

  app.use((req, res) => res.status(404).json({ error: `no route for ${req.method} ${req.path}` }));
  app.use(handleError);

  const server = app.listen(port, () => logger.info({ port }, 'service started'));
  server.maxRequestsPerSocket = REQUESTS_PER_CONNECTION;

  process.once('SIGTERM', async () => {
    logger.info('SIGTERM received, draining connections');
    await sleep(DRAIN_DELAY_MS);
    server.close(async () => {
      await runShutdownHooks();
      process.exit(0);
    });
  });

  return app;
}

function handleError(err, req, res, _next) {
  const status = err.status || 500;

  if (status >= 500) {
    logger.error({ err, method: req.method, path: req.path }, 'request failed');
    const span = trace.getActiveSpan();
    span?.recordException(err);
    span?.setStatus({ code: SpanStatusCode.ERROR, message: err.message });
  } else {
    logger.warn({ status, method: req.method, path: req.path, reason: err.message }, 'request rejected');
  }

  res.status(status).json({ error: err.message });
}

module.exports = { createService };
