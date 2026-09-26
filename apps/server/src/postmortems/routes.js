import { Router } from 'express';
import { z } from 'zod';
import { parse } from '../http/errors.js';
import { limitPerPerson } from '../http/limits.js';
import { requireRole } from '../auth/middleware.js';
import { actorOf } from '../auth/session.js';

const incidentNumber = z.coerce.number().int().positive();
const edit = z.object({ markdown: z.string().trim().min(20).max(50_000) });

// Writing a draft costs a model call.
const draftLimiter = limitPerPerson({
  minutes: 10,
  limit: 5,
  error: 'too many postmortem drafts requested, wait a few minutes',
});

// Mounted at /api/incidents/:number/postmortem. Reading is open to everyone signed in; writing
// is for responders, since a postmortem speaks for the team.
export function postmortemRouter({ postmortems }) {
  const router = Router({ mergeParams: true });
  const number = (req) => parse(incidentNumber, req.params.number);

  router.get('/', async (req, res) => {
    res.json(await postmortems.get(number(req)));
  });

  router.post('/', requireRole('responder'), draftLimiter, async (req, res) => {
    await postmortems.redraft(number(req));
    res.status(202).json({ status: 'drafting' });
  });

  router.put('/', requireRole('responder'), async (req, res) => {
    const { markdown } = parse(edit, req.body);
    res.json(await postmortems.save(number(req), { markdown, by: actorOf(req.user) }));
  });

  router.post('/finalize', requireRole('responder'), async (req, res) => {
    res.json(await postmortems.finalize(number(req), { by: actorOf(req.user) }));
  });

  return router;
}
