import { randomBytes } from 'node:crypto';
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { config } from '../config.js';
import { User } from '../models/user.js';
import { HttpError, parse } from '../http/errors.js';
import { clearSession, issueSession } from './session.js';
import { requireSession } from './middleware.js';

const GUEST_HOURS = 2;

const credentials = z.object({
  email: z.email().transform((email) => email.toLowerCase()),
  password: z.string().min(1).max(200),
});

// Same cost for unknown emails as for wrong passwords, so response times don't reveal
// which accounts exist.
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 10);

export function authRouter() {
  const router = Router();

  const loginLimiter = rateLimit({
    windowMs: 15 * 60_000,
    limit: 10,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { error: 'too many sign-in attempts, try again in a few minutes' },
  });

  router.post('/login', loginLimiter, async (req, res) => {
    const { email, password } = parse(credentials, req.body);
    const user = await User.findOne({ email }).select('+passwordHash');
    const valid = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);
    if (!user || !valid) throw new HttpError(401, 'wrong email or password');

    issueSession(res, user.toSession());
    res.json({ user: user.toSession() });
  });

  // What the sign-in page can offer.
  router.get('/options', (req, res) => {
    res.json({ guests: config.demo.guests });
  });

  // Visitors of the public demo try OpsPilot without an account. A guest session isn't
  // stored anywhere and ends after two hours; its role only reaches the demo sandbox.
  const guestLimiter = rateLimit({
    windowMs: 60 * 60_000,
    limit: 20,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { error: 'too many guest sessions from here, try again later' },
  });

  router.post('/guest', guestLimiter, (req, res) => {
    if (!config.demo.guests) throw new HttpError(404, 'guest access is off');
    const id = randomBytes(4).toString('hex');
    const user = { id: `guest-${id}`, email: null, name: `Guest ${id.slice(0, 4)}`, role: 'guest' };
    issueSession(res, user, { hours: GUEST_HOURS });
    res.json({ user });
  });

  router.post('/logout', (req, res) => {
    clearSession(res);
    res.status(204).end();
  });

  router.get('/me', requireSession, (req, res) => {
    res.json({ user: req.user });
  });

  return router;
}
