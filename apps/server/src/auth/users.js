import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { ROLES, User } from '../models/user.js';
import { HttpError, parse } from '../http/errors.js';
import { logger } from '../logger.js';
import { requireRole } from './middleware.js';

const BCRYPT_COST = 12;

const newUser = z.object({
  email: z.email().transform((email) => email.toLowerCase()),
  name: z.string().trim().min(1).max(80),
  password: z.string().min(10).max(200),
  role: z.enum(ROLES).default('viewer'),
});

export function usersRouter() {
  const router = Router();
  router.use(requireRole('admin'));

  router.get('/', async (req, res) => {
    const users = await User.find().sort({ createdAt: 1 });
    res.json(users.map((user) => user.toSession()));
  });

  router.post('/', async (req, res) => {
    const input = parse(newUser, req.body);
    if (await User.exists({ email: input.email })) throw new HttpError(409, 'a user with that email already exists');

    const user = await User.create({ ...input, passwordHash: await bcrypt.hash(input.password, BCRYPT_COST) });
    res.status(201).json(user.toSession());
  });

  return router;
}

// The first admin comes from ADMIN_EMAIL / ADMIN_PASSWORD. It's only created when that
// email doesn't exist yet, so changing the variables later never overwrites a password.
export async function ensureAdmin(admin) {
  if (!admin) {
    if (!(await User.exists({ role: 'admin' }))) {
      logger.warn('no admin account yet: set ADMIN_EMAIL and ADMIN_PASSWORD and restart');
    }
    return;
  }

  const email = admin.email.toLowerCase();
  if (await User.exists({ email })) return;

  await User.create({
    email,
    name: email.split('@')[0],
    role: 'admin',
    passwordHash: await bcrypt.hash(admin.password, BCRYPT_COST),
  });
  logger.info({ email }, 'created the first admin account');
}
