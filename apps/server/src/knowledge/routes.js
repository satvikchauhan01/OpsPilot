import { Router } from 'express';
import { z } from 'zod';
import { parse } from '../http/errors.js';

const searchQuery = z.object({
  q: z.string().trim().min(2, 'search for at least two characters').max(200),
  service: z.string().max(100).optional(),
  limit: z.coerce.number().int().min(1).max(20).default(8),
});

const slug = z.string().regex(/^[a-z0-9-]{1,100}$/);

export function runbooksRouter({ runbooks }) {
  const router = Router();

  router.get('/', async (req, res) => {
    res.json(await runbooks.list());
  });

  router.get('/search', async (req, res) => {
    const { q, service, limit } = parse(searchQuery, req.query);
    res.json(await runbooks.search(q, { service, limit }));
  });

  router.get('/:slug', async (req, res) => {
    res.json(await runbooks.get(parse(slug, req.params.slug)));
  });

  return router;
}
