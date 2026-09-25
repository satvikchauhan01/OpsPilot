import { Router } from 'express';

export function topologyRouter({ topology }) {
  const router = Router();
  router.get('/', (req, res) => res.json(topology.snapshot()));
  return router;
}
