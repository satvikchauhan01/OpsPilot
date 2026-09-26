import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { parse } from '../http/errors.js';
import { requireRole } from '../auth/middleware.js';
import { ACTION_TYPES } from './catalog.js';

const incidentNumber = z.coerce.number().int().positive();
const actionId = z.string().regex(/^[0-9a-f]{24}$/, 'not an action id');

const proposal = z.object({
  type: z.enum(ACTION_TYPES),
  service: z.string().max(100),
  replicas: z.number().int().optional(),
  reason: z.string().trim().max(500).optional(),
});

const rejection = z.object({ reason: z.string().trim().min(3, 'say why, in a few words').max(500) });

// Everything that changes the cluster is limited per person, not only per address.
const actionLimiter = rateLimit({
  windowMs: 10 * 60_000,
  limit: 30,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  keyGenerator: (req) => req.user.id,
  message: { error: 'too many fixes proposed or decided, wait a few minutes' },
});

// Mounted at /api/incidents/:number/actions
export function incidentActionsRouter({ remediation }) {
  const router = Router({ mergeParams: true });
  const number = (req) => parse(incidentNumber, req.params.number);

  router.get('/', async (req, res) => {
    res.json(await remediation.list(number(req)));
  });

  // A responder proposing a fix of their own. It still needs an approval, which the same
  // responder can give.
  router.post('/', requireRole('responder'), actionLimiter, async (req, res) => {
    const { type, service, replicas, reason } = parse(proposal, req.body);
    const params = type === 'scale' ? { service, replicas } : { service };
    const action = await remediation.propose(
      number(req),
      { type, params },
      {
        by: req.user.email,
        reason,
        source: { kind: 'responder' },
      },
    );
    res.status(201).json(action.toJSON());
  });

  return router;
}

// Mounted at /api/actions
export function actionsRouter({ remediation }) {
  const router = Router();

  router.post('/:id/approve', requireRole('responder'), actionLimiter, async (req, res) => {
    const action = await remediation.approve(parse(actionId, req.params.id), { by: req.user.email });
    res.status(202).json(action.toJSON());
  });

  router.post('/:id/reject', requireRole('responder'), actionLimiter, async (req, res) => {
    const { reason } = parse(rejection, req.body);
    const action = await remediation.reject(parse(actionId, req.params.id), { by: req.user.email, reason });
    res.json(action.toJSON());
  });

  return router;
}

export function remediationStatusRouter({ remediation }) {
  const router = Router();
  router.get('/', (req, res) => res.json(remediation.status()));
  return router;
}
