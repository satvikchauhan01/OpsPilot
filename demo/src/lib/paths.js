// Endpoints that exist for Kubernetes, Prometheus and the scenario scripts rather than for
// customers. They are kept out of traces and request metrics so they don't skew the data.
const INTERNAL_PATHS = new Set(['/healthz', '/readyz', '/metrics', '/_chaos']);

function isInternalPath(url = '') {
  return INTERNAL_PATHS.has(url.split('?')[0]);
}

module.exports = { isInternalPath };
