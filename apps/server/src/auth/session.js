import jwt from 'jsonwebtoken';
import { config } from '../config.js';

export const SESSION_COOKIE = 'opspilot_session';
const SESSION_HOURS = 12;

export function issueSession(res, user) {
  const token = jwt.sign({ sub: user.id, email: user.email, name: user.name, role: user.role }, config.sessionSecret, {
    expiresIn: `${SESSION_HOURS}h`,
  });
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.isProduction,
    maxAge: SESSION_HOURS * 3600_000,
    path: '/',
  });
}

export function clearSession(res) {
  res.clearCookie(SESSION_COOKIE, { path: '/' });
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
