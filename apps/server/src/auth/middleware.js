import { HttpError } from '../http/errors.js';
import { readSession } from './session.js';

export function requireSession(req, res, next) {
  const user = readSession(req);
  if (!user) return next(new HttpError(401, 'sign in first'));
  req.user = user;
  next();
}

// Admins can do everything a responder can.
export function requireRole(...roles) {
  const allowed = new Set([...roles, 'admin']);
  return (req, res, next) => {
    if (!allowed.has(req.user?.role)) return next(new HttpError(403, `this needs the ${roles.join(' or ')} role`));
    next();
  };
}
