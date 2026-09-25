import { Router } from 'express';
import { Alert } from '../models/alert.js';
import { compareSeverity } from '../alerts/severity.js';
import { finite } from '../telemetry/prometheus.js';
import { serviceQueries } from '../topology/service.js';

const HISTORY_MS = 60 * 60_000;
const HISTORY_STEP_SECONDS = 60;

// One row per service for the overview: current health, a one-hour history, the deployed
// version and replicas, and any firing alerts.
export function servicesRouter({ prometheus, tracker, config }) {
  const router = Router();

  router.get('/', async (req, res) => {
    const queries = serviceQueries(config.kube.namespace);
    const now = new Date();
    const historyWindow = { start: new Date(now - HISTORY_MS), end: now, stepSeconds: HISTORY_STEP_SECONDS };

    const [rps, errorRatio, p95, memory, saturation, errorHistory, rpsHistory, firing] = await Promise.all([
      prometheus.query(queries.rps),
      prometheus.query(queries.errorRatio),
      prometheus.query(queries.p95),
      prometheus.query(queries.memory),
      prometheus.query(queries.saturation),
      prometheus.queryRange(queries.errorRatio, historyWindow),
      prometheus.queryRange(queries.rps, historyWindow),
      Alert.find({ status: 'firing' }, 'service severity name'),
    ]);

    const instant = (series) => new Map(series.map(({ labels, value }) => [labels.service, finite(value)]));
    const range = (series) =>
      new Map(series.map(({ labels, points }) => [labels.service, points.map(([t, v]) => [t, finite(v)])]));

    const current = {
      rps: instant(rps),
      errorRatio: instant(errorRatio),
      p95: instant(p95),
      memory: instant(memory),
      saturation: instant(saturation),
    };
    const history = { errorRatio: range(errorHistory), rps: range(rpsHistory) };
    const workloads = new Map(tracker.workloads().map((workload) => [workload.name, workload]));

    const names = new Set([...current.rps.keys(), ...workloads.keys()]);
    const services = [...names].sort().map((name) => {
      const alerts = firing.filter((alert) => alert.service === name);
      const worst = alerts.map((alert) => alert.severity).sort(compareSeverity)[0];
      return {
        name,
        status: worst ?? 'ok',
        firingAlerts: [...new Set(alerts.map((alert) => alert.name))],
        rps: current.rps.get(name) ?? null,
        errorRatio: current.errorRatio.get(name) ?? null,
        p95: current.p95.get(name) ?? null,
        memory: current.memory.get(name) ?? null,
        saturation: current.saturation.get(name) ?? null,
        history: { errorRatio: history.errorRatio.get(name) ?? [], rps: history.rps.get(name) ?? [] },
        workload: workloads.get(name) ?? null,
      };
    });

    res.json({ at: now.toISOString(), services });
  });

  return router;
}
