import { HttpError } from '../http/errors.js';
import { readSession } from './session.js';
import { accounts } from './accounts.js';

// The cookie says who signed in. For team accounts the role and name come from the account
// as it is now, so a change an admin makes applies to sessions that are already open.
// Guests have no account: their session is all there is.
export async function requireSession(req, res, next) {
  const session = readSession(req);
  if (!session) return next(new HttpError(401, 'sign in first'));
  if (session.role === 'guest') {
    req.user = session;
    return next();
  }

  try {
    const account = await accounts.current(session.id);
    if (!account) return next(new HttpError(401, 'this account no longer exists'));
    req.user = { ...session, ...account };
    next();
  } catch (err) {
    next(err);
  }
}

// Admins can do everything a responder can.
export function requireRole(...roles) {
  const allowed = new Set([...roles, 'admin']);
  return (req, res, next) => {
    if (!allowed.has(req.user?.role)) return next(new HttpError(403, `this needs the ${roles.join(' or ')} role`));
    next();
  };
}
