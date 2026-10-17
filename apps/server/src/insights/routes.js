import { Router } from 'express';
import { z } from 'zod';
import { parse } from '../http/errors.js';
import { incidentInsights } from './service.js';

const insightsQuery = z.object({
  days: z.coerce
    .number()
    .refine((days) => [7, 30, 90, 365].includes(days), 'days must be 7, 30, 90 or 365')
    .default(30),
});

// Mounted at /api/insights
export function insightsRouter() {
  const router = Router();

  router.get('/', async (req, res) => {
    const { days } = parse(insightsQuery, req.query);
    res.json(await incidentInsights(days));
  });

  return router;
}
