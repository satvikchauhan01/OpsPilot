import { Router } from 'express';
import { z } from 'zod';
import { parse } from '../http/errors.js';
import { requireRole } from '../auth/middleware.js';
import { SEVERITIES } from '../alerts/severity.js';
import { blastRadius, buildGraph } from '../topology/graph.js';
import { loadTopology } from '../topology/service.js';
import { INCIDENT_STATUSES } from './status.js';
import { incidentMetrics } from './metrics.js';

const listQuery = z.object({
  status: z.enum([...INCIDENT_STATUSES, 'active']).optional(),
  severity: z.enum(SEVERITIES).optional(),
  service: z.string().max(100).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

const incidentNumber = z.coerce.number().int().positive();

const statusChange = z.object({
  status: z.enum(INCIDENT_STATUSES),
  note: z.string().trim().max(500).optional(),
});

export function incidentsRouter({ incidents, investigations, prometheus, config }) {
  const router = Router();
  const number = (req) => parse(incidentNumber, req.params.number);

  router.get('/', async (req, res) => {
    res.json(await incidents.list(parse(listQuery, req.query)));
  });

  router.get('/:number', async (req, res) => {
    res.json(await incidents.get(number(req)));
  });

  router.get('/:number/timeline', async (req, res) => {
    const incident = await incidents.findByNumber(number(req));
    const history = investigations ? await investigations.forIncident(incident._id) : [];
    res.json(await incidents.timeline(incident.number, { investigations: history }));
  });

  // The dependency graph as it was during the incident, with the suspected service and
  // everything upstream of it (the blast radius) marked.
  router.get('/:number/topology', async (req, res) => {
    const incident = await incidents.findByNumber(number(req));
    const at = incident.status === 'resolved' ? incident.lastAlertAt : new Date();
    const topology = await loadTopology(prometheus, config.kube.namespace, at);
    const suspected = incident.suspectedService;

    res.json({
      ...topology,
      suspected,
      blastRadius: suspected ? blastRadius(buildGraph(topology.edges), suspected) : [],
      alerting: incident.services,
    });
  });

  router.get('/:number/metrics', async (req, res) => {
    const incident = await incidents.findByNumber(number(req));
    res.json(await incidentMetrics(prometheus, config.kube.namespace, incident));
  });

  router.post('/:number/status', requireRole('responder'), async (req, res) => {
    const { status, note } = parse(statusChange, req.body);
    const incident = await incidents.changeStatus(number(req), status, { by: req.user.email, note });
    res.json(incident.toJSON());
  });

  return router;
}
