import jwt from 'jsonwebtoken';
import { config } from '../config.js';

export const SESSION_COOKIE = 'opspilot_session';
const SESSION_HOURS = 12;

export function issueSession(res, user, { hours = SESSION_HOURS } = {}) {
  const token = jwt.sign({ sub: user.id, email: user.email, name: user.name, role: user.role }, config.sessionSecret, {
    expiresIn: `${hours}h`,
  });
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.isProduction,
    maxAge: hours * 3600_000,
    path: '/',
  });
}

export function clearSession(res) {
  res.clearCookie(SESSION_COOKIE, { path: '/' });
}

// How a person appears in what they did: timelines, fixes, the audit log. Their display name,
// never their email, since a public demo shows these to every visitor.
export function actorOf(user) {
  return user.name;
}

export function readSession(req) {
  const token = req.cookies?.[SESSION_COOKIE];
  if (!token) return null;
  try {
    const claims = jwt.verify(token, config.sessionSecret);
    return { id: claims.sub, email: claims.email, name: claims.name, role: claims.role };
  } catch {
    return null;
  }
}
