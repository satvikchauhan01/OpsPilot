import { timingSafeEqual } from 'node:crypto';
import { Router } from 'express';
import { HttpError, parse } from '../http/errors.js';
import { logger } from '../logger.js';
import { alertmanagerPayload } from './normalize.js';

export function webhookRouter({ incidents, config }) {
  const router = Router();

  router.post('/alertmanager', async (req, res) => {
    if (!hasToken(req, config.webhookToken)) {
      logger.warn({ ip: req.ip }, 'rejected an Alertmanager webhook with a missing or wrong token');
      throw new HttpError(401, 'invalid webhook token');
    }

    const payload = parse(alertmanagerPayload, req.body);
    const summary = await incidents.ingest(payload);
    logger.debug(summary, 'alerts ingested');
    res.json(summary);
  });

  return router;
}

function hasToken(req, expected) {
  const header = req.get('authorization') ?? '';
  const given = Buffer.from(header.startsWith('Bearer ') ? header.slice(7) : '');
  const wanted = Buffer.from(expected);
  return given.length === wanted.length && timingSafeEqual(given, wanted);
}
