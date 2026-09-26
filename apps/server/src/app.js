import express from 'express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import mongoose from 'mongoose';
import { handleApiNotFound, handleErrors } from './http/errors.js';
import { requireSession } from './auth/middleware.js';
import { authRouter } from './auth/routes.js';
import { usersRouter } from './auth/users.js';
import { webhookRouter } from './alerts/routes.js';
import { incidentsRouter } from './incidents/routes.js';
import { servicesRouter } from './services/routes.js';
import { topologyRouter } from './topology/routes.js';
import { changesRouter } from './changes/routes.js';
import { streamRouter } from './realtime/stream.js';
import { aiStatusRouter, investigationsRouter } from './investigation/routes.js';
import { runbooksRouter } from './knowledge/routes.js';

export function createApp(context) {
  const app = express();
  app.disable('x-powered-by');
  // In production OpsPilot sits behind the cluster's ingress, which sets X-Forwarded-For.
  app.set('trust proxy', context.config.isProduction ? 1 : false);

  app.use(helmet());
  app.use(express.json({ limit: '2mb' }));
  app.use(cookieParser());

  app.get('/api/health', (req, res) => {
    const database = mongoose.connection.readyState === 1 ? 'up' : 'down';
    res.status(database === 'up' ? 200 : 503).json({ status: database === 'up' ? 'ok' : 'degraded', database });
  });

  // Machine-to-machine and sign-in routes, before the session check
  app.use('/api/webhooks', webhookRouter(context));
  app.use('/api/auth', authRouter(context));

  app.use('/api', requireSession);
  app.use('/api/stream', streamRouter());
  app.use('/api/incidents/:number/investigations', investigationsRouter(context));
  app.use('/api/incidents', incidentsRouter(context));
  app.use('/api/ai', aiStatusRouter(context));
  app.use('/api/services', servicesRouter(context));
  app.use('/api/topology', topologyRouter(context));
  app.use('/api/changes', changesRouter(context));
  app.use('/api/runbooks', runbooksRouter(context));
  app.use('/api/users', usersRouter(context));

  app.use('/api', handleApiNotFound);
  app.use(handleErrors);
  return app;
}
