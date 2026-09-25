import { config } from './config.js';
import { logger } from './logger.js';
import { connectDatabase, disconnectDatabase } from './db.js';
import { createApp } from './app.js';
import { ensureAdmin } from './auth/users.js';
import { createPrometheus } from './telemetry/prometheus.js';
import { createLoki } from './telemetry/loki.js';
import { createTempo } from './telemetry/tempo.js';
import { createTopologyCache } from './topology/service.js';
import { createKubeClient } from './kube/client.js';
import { startChangeTracker } from './changes/tracker.js';
import { createIncidentService } from './incidents/service.js';
import { startLifecycle } from './incidents/lifecycle.js';
import { createGemini } from './llm/gemini.js';
import { createInvestigationService } from './investigation/service.js';

if (config.sessionSecretIsEphemeral)
  logger.warn('SESSION_SECRET is not set, so sessions end whenever the server restarts');

await connectDatabase(config.mongo);
await ensureAdmin(config.admin);

const prometheus = createPrometheus(config.urls.prometheus);
const loki = createLoki(config.urls.loki);
const tempo = createTempo(config.urls.tempo);
const topology = createTopologyCache(prometheus, config.kube.namespace);
await topology.start();

const kube = createKubeClient(config.kube);
const tracker = startChangeTracker({ kube, namespace: config.kube.namespace });
const incidents = createIncidentService({ topology, config });
const lifecycle = startLifecycle({ incidents, alertmanagerUrl: config.urls.alertmanager });

const llm = createGemini(config.llm);
if (!llm) logger.warn('GEMINI_API_KEY is not set, so incidents will not be investigated automatically');
const investigations = createInvestigationService({
  llm,
  telemetry: { prometheus, loki, tempo, kube, namespace: config.kube.namespace },
  incidents,
  topology,
  tracker,
  config,
});
await investigations.failInterrupted();
investigations.investigateNewIncidents();

const app = createApp({ config, prometheus, topology, tracker, incidents, investigations });
const server = app.listen(config.port, () =>
  logger.info({ port: config.port, model: llm?.model }, 'OpsPilot server listening'),
);

async function shutdown(signal) {
  logger.info({ signal }, 'shutting down');
  lifecycle.stop();
  topology.stop();
  server.close();
  await tracker.stop();
  await disconnectDatabase();
  process.exit(0);
}

process.once('SIGTERM', () => shutdown('SIGTERM'));
process.once('SIGINT', () => shutdown('SIGINT'));
