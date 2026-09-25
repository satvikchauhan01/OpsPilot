import { Router } from 'express';
import { z } from 'zod';
import { CHANGE_KINDS, Change } from '../models/change.js';
import { parse } from '../http/errors.js';

const changesQuery = z.object({
  minutes: z.coerce
    .number()
    .int()
    .min(1)
    .max(7 * 24 * 60)
    .default(180),
  service: z.string().max(100).optional(),
  // comma-separated, e.g. kinds=deploy,scale
  kinds: z
    .string()
    .transform((value) => value.split(',').filter(Boolean))
    .pipe(z.array(z.enum(CHANGE_KINDS)))
    .optional(),
  limit: z.coerce.number().int().min(1).max(500).default(100),
});

export function changesRouter({ config }) {
  const router = Router();

  router.get('/', async (req, res) => {
    const { minutes, service, kinds, limit } = parse(changesQuery, req.query);
    const filter = { namespace: config.kube.namespace, at: { $gte: new Date(Date.now() - minutes * 60_000) } };
    if (service) filter.service = service;
    if (kinds?.length) filter.kind = { $in: kinds };

    const changes = await Change.find(filter).sort({ at: -1 }).limit(limit);
    res.json(changes.map((change) => change.toJSON()));
  });

  return router;
}
