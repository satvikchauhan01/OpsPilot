const { HttpError } = require('./errors');
const { upstreamRequests, upstreamDuration } = require('./metrics');

class UpstreamError extends HttpError {
  constructor(target, status, message) {
    super(status, `${target}: ${message}`);
    this.name = 'UpstreamError';
    this.target = target;
  }
}

// Services find each other through Kubernetes DNS. <TARGET>_URL overrides that for local runs.
function baseUrl(target) {
  return process.env[`${target.toUpperCase()}_URL`] || `http://${target}`;
}

async function callService(target, path, { method = 'GET', body, timeoutMs = 2000 } = {}) {
  const stopTimer = upstreamDuration.startTimer({ target });
  let outcome = 'error';

  try {
    const res = await fetch(`${baseUrl(target)}${path}`, {
      method,
      headers: body ? { 'content-type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(timeoutMs),
    });
    const payload = await res.json().catch(() => ({}));

    if (res.ok) {
      outcome = 'ok';
      return payload;
    }
    // A 4xx is the caller's problem and is passed through as-is; a 5xx is a bad gateway.
    if (res.status < 500) {
      outcome = 'client_error';
      throw new UpstreamError(target, res.status, payload.error || res.statusText);
    }
    throw new UpstreamError(target, 502, payload.error || `responded with ${res.status}`);
  } catch (err) {
    if (err instanceof UpstreamError) throw err;
    if (err.name === 'TimeoutError') {
      outcome = 'timeout';
      throw new UpstreamError(target, 504, `no response within ${timeoutMs}ms`);
    }
    throw new UpstreamError(target, 502, err.cause?.message || err.message);
  } finally {
    upstreamRequests.inc({ target, outcome });
    stopTimer();
  }
}

module.exports = { callService, UpstreamError };
