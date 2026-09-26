import { Router } from 'express';
import { z } from 'zod';
import { parse } from '../http/errors.js';
import { limitPerPerson } from '../http/limits.js';
import { requireRole } from '../auth/middleware.js';
import { actorOf } from '../auth/session.js';
import { SCENARIOS } from './scenarios.js';

const scenarioKey = z.enum(SCENARIOS.map((scenario) => scenario.key));

// Each scenario ends in an investigation, so starting them is limited per person.
const triggerLimiter = limitPerPerson({
  minutes: 30,
  limit: 4,
  error: 'you have started enough scenarios for now, try again later',
});

// Mounted at /api/demo
export function demoRouter({ demo }) {
  const router = Router();

  router.get('/', async (req, res) => {
    res.json(await demo.status());
  });

  router.post('/scenarios/:key', requireRole('responder', 'guest'), triggerLimiter, async (req, res) => {
    res.status(202).json(await demo.trigger(parse(scenarioKey, req.params.key), { by: actorOf(req.user) }));
  });

  // Guests wait for the automatic reset; a responder can put the shop back right away.
  router.post('/reset', requireRole('responder'), async (req, res) => {
    res.json(await demo.reset({ by: actorOf(req.user) }));
  });

  return router;
}
