import { Router } from 'express';
import bcrypt from 'bcryptjs';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { User } from '../models/user.js';
import { HttpError, parse } from '../http/errors.js';
import { clearSession, issueSession } from './session.js';
import { requireSession } from './middleware.js';

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

  router.post('/logout', (req, res) => {
    clearSession(res);
    res.status(204).end();
  });

  router.get('/me', requireSession, (req, res) => {
    res.json({ user: req.user });
  });

  return router;
}
