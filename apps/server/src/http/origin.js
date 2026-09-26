import { HttpError } from './errors.js';

// The UI and the API share one origin, so no CORS headers are ever sent and browsers keep
// other sites from reading any response. Browsers do still send requests that change
// something; those carry an Origin header, and only OpsPilot's own origin is accepted.
// Server-to-server calls, like Alertmanager's webhook, send no Origin at all.
export function sameOriginOnly(origin) {
  return (req, res, next) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
    const from = req.get('origin');
    if (from && from !== origin) return next(new HttpError(403, 'requests from other sites are not accepted'));
    next();
  };
}
