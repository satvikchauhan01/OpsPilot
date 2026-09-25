const client = require('prom-client');
const { isInternalPath } = require('./paths');

const register = new client.Registry();
register.setDefaultLabels({ service: process.env.SERVICE, version: process.env.APP_VERSION });
client.collectDefaultMetrics({ register });

const LATENCY_BUCKETS = [0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5];

const httpRequests = new client.Counter({
  name: 'http_requests_total',
  help: 'HTTP requests served, by route and status code',
  labelNames: ['method', 'route', 'status_code'],
  registers: [register],
});

const httpDuration = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Time taken to serve HTTP requests',
  labelNames: ['method', 'route', 'status_code'],
  buckets: LATENCY_BUCKETS,
  registers: [register],
});

const upstreamRequests = new client.Counter({
  name: 'http_client_requests_total',
  help: 'Calls made to other services, by target and outcome',
  labelNames: ['target', 'outcome'],
  registers: [register],
});

const upstreamDuration = new client.Histogram({
  name: 'http_client_request_duration_seconds',
  help: 'Time spent waiting on other services',
  labelNames: ['target'],
  buckets: LATENCY_BUCKETS,
  registers: [register],
});

function trackRequests(req, res, next) {
  if (isInternalPath(req.path)) return next();

  const stopTimer = httpDuration.startTimer();
  // 'close' fires even when the caller hangs up before we answer. Those requests are recorded
  // as 499 (nginx's "client closed request"), so slow responses nobody waited for still show
  // up in this service's latency instead of silently disappearing.
  res.on('close', () => {
    // Label with the route pattern, not the raw URL, so ids can't blow up cardinality.
    const route = req.route ? `${req.baseUrl}${req.route.path}` : 'unmatched';
    const status = res.writableFinished ? res.statusCode : 499;
    const labels = { method: req.method, route, status_code: status };
    httpRequests.inc(labels);
    stopTimer(labels);
  });
  next();
}

module.exports = { register, trackRequests, upstreamRequests, upstreamDuration };
