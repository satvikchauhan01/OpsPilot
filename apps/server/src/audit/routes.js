import { Router } from 'express';
import { z } from 'zod';
import { parse } from '../http/errors.js';

const listQuery = z.object({
  incident: z.coerce.number().int().positive().optional(),
  type: z
    .string()
    .regex(/^[a-z_.]{1,60}$/)
    .optional(),
  before: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().min(1).max(500).default(100),
});

// Read-only on purpose: there is no route that changes or removes an audit record.
export function auditRouter({ audit }) {
  const router = Router();

  router.get('/', async (req, res) => {
    res.json(await audit.list(parse(listQuery, req.query)));
  });

  router.get('/verify', async (req, res) => {
    res.json(await audit.verify());
  });

  return router;
}
