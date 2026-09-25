import { Router } from 'express';
import { z } from 'zod';
import { parse } from '../http/errors.js';
import { requireRole } from '../auth/middleware.js';

const incidentNumber = z.coerce.number().int().positive();
const investigationId = z.union([z.literal('latest'), z.string().regex(/^[0-9a-f]{24}$/)]);

// Mounted at /api/incidents/:number/investigations
export function investigationsRouter({ investigations }) {
  const router = Router({ mergeParams: true });
  const number = (req) => parse(incidentNumber, req.params.number);

  router.get('/', async (req, res) => {
    res.json(await investigations.list(number(req)));
  });

  router.get('/:id', async (req, res) => {
    res.json(await investigations.get(number(req), parse(investigationId, req.params.id)));
  });

  router.post('/', requireRole('responder'), async (req, res) => {
    const investigation = await investigations.start(number(req), { trigger: 'manual', requestedBy: req.user.email });
    res.status(202).json(investigation.toJSON());
  });

  return router;
}

export function aiStatusRouter({ investigations }) {
  const router = Router();
  router.get('/', async (req, res) => res.json(await investigations.status()));
  return router;
}
