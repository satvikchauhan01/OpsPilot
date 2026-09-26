import { Router } from 'express';
import { z } from 'zod';
import { HttpError, parse } from '../http/errors.js';
import { limitPerPerson } from '../http/limits.js';
import { requireRole } from '../auth/middleware.js';
import { actorOf } from '../auth/session.js';

const incidentNumber = z.coerce.number().int().positive();
const investigationId = z.union([z.literal('latest'), z.string().regex(/^[0-9a-f]{24}$/)]);

// Each investigation costs several model calls from a free quota shared with everyone.
const investigationLimiter = limitPerPerson({
  minutes: 10,
  limit: 5,
  error: 'too many investigations started, wait a few minutes',
});

// Mounted at /api/incidents/:number/investigations
export function investigationsRouter({ investigations, incidents }) {
  const router = Router({ mergeParams: true });
  const number = (req) => parse(incidentNumber, req.params.number);

  router.get('/', async (req, res) => {
    res.json(await investigations.list(number(req)));
  });

  router.get('/:id', async (req, res) => {
    res.json(await investigations.get(number(req), parse(investigationId, req.params.id)));
  });

  router.post('/', requireRole('responder', 'guest'), investigationLimiter, async (req, res) => {
    // Guests look into live incidents. Going back over resolved ones spends the shared AI
    // budget for little, so that stays with the team.
    if (req.user.role === 'guest' && (await incidents.findByNumber(number(req))).status === 'resolved') {
      throw new HttpError(403, 'guests can investigate incidents that are still open');
    }
    const investigation = await investigations.start(number(req), {
      trigger: 'manual',
      requestedBy: actorOf(req.user),
    });
    res.status(202).json(investigation.toJSON());
  });

  return router;
}

export function aiStatusRouter({ investigations }) {
  const router = Router();
  router.get('/', async (req, res) => res.json(await investigations.status()));
  return router;
}
