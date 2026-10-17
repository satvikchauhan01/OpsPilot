import { Router } from 'express';
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import { z } from 'zod';
import { ROLES, User } from '../models/user.js';
import { HttpError, notFound, parse } from '../http/errors.js';
import { logger } from '../logger.js';
import { requireRole } from './middleware.js';
import { actorOf } from './session.js';
import { accounts } from './accounts.js';
import { teamChangeRefusal } from './team.js';

const BCRYPT_COST = 12;

const newUser = z.object({
  email: z.email().transform((email) => email.toLowerCase()),
  name: z.string().trim().min(1).max(80),
  password: z.string().min(10).max(200),
  role: z.enum(ROLES).default('viewer'),
});

const roleChange = z.object({ role: z.enum(ROLES) });
const userId = z.string().refine((id) => mongoose.isValidObjectId(id), 'not a user id');

function teamMember(user) {
  return { ...user.toSession(), createdAt: user.createdAt };
}

// Mounted at /api/users. Every change to who can do what goes into the audit log, by name
// and role only: the log is visible to everyone signed in, guests of a public demo included.
export function usersRouter({ audit }) {
  const router = Router();
  router.use(requireRole('admin'));

  async function target(req) {
    const user = await User.findById(parse(userId, req.params.id));
    if (!user) throw notFound('user');
    return user;
  }

  async function refuseIfNeeded(req, user, change, role) {
    const admins = await User.countDocuments({ role: 'admin' });
    const refusal = teamChangeRefusal({ actor: req.user, target: user, change, role, admins });
    if (refusal) throw new HttpError(409, refusal);
  }

  router.get('/', async (req, res) => {
    const users = await User.find().sort({ createdAt: 1 });
    res.json(users.map(teamMember));
  });

  router.post('/', async (req, res) => {
    const input = parse(newUser, req.body);
    if (await User.exists({ email: input.email })) throw new HttpError(409, 'a user with that email already exists');

    const user = await User.create({ ...input, passwordHash: await bcrypt.hash(input.password, BCRYPT_COST) });
    await audit.append({ type: 'user.created', actor: actorOf(req.user), data: { user: user.name, role: user.role } });
    res.status(201).json(teamMember(user));
  });

  router.patch('/:id', async (req, res) => {
    const { role } = parse(roleChange, req.body);
    const user = await target(req);
    if (user.role === role) return res.json(teamMember(user));
    await refuseIfNeeded(req, user, 'role', role);

    const from = user.role;
    user.role = role;
    await user.save();
    accounts.forget(user.id);
    await audit.append({
      type: 'user.role_changed',
      actor: actorOf(req.user),
      data: { user: user.name, from, to: role },
    });
    res.json(teamMember(user));
  });

  router.delete('/:id', async (req, res) => {
    const user = await target(req);
    await refuseIfNeeded(req, user, 'remove');

    await user.deleteOne();
    accounts.forget(user.id);
    await audit.append({ type: 'user.removed', actor: actorOf(req.user), data: { user: user.name, role: user.role } });
    res.status(204).end();
  });

  return router;
}

// The first admin comes from ADMIN_EMAIL / ADMIN_PASSWORD. It's only created when that
// email doesn't exist yet, so changing the variables later never overwrites a password. The
// display name (ADMIN_NAME) can change at any time: it is what others see in the timeline.
export async function ensureAdmin(admin) {
  if (!admin) {
    if (!(await User.exists({ role: 'admin' }))) {
      logger.warn('no admin account yet: set ADMIN_EMAIL and ADMIN_PASSWORD and restart');
    }
    return;
  }

  const email = admin.email.toLowerCase();
  const existing = await User.findOne({ email });
  if (existing) {
    if (admin.name && existing.name !== admin.name) {
      existing.name = admin.name;
      await existing.save();
    }
    return;
  }

  await User.create({
    email,
    name: admin.name ?? email.split('@')[0],
    role: 'admin',
    passwordHash: await bcrypt.hash(admin.password, BCRYPT_COST),
  });
  logger.info({ email }, 'created the first admin account');
}
