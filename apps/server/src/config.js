import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

// Locally, settings come from the repository's .env file (gitignored, see .env.example).
// In the cluster the file doesn't exist and everything comes from the pod's environment.
// Variables that are already set always win over the file.
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
try {
  process.loadEnvFile(path.join(ROOT, '.env'));
} catch (err) {
  if (err.code !== 'ENOENT') throw err;
}

const schema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),

  MONGODB_URI: z.string().min(1, 'set it to your MongoDB Atlas connection string'),
  MONGODB_DB: z.string().default('opspilot'),

  SESSION_SECRET: z.string().min(32, 'use at least 32 random characters').optional(),
  ADMIN_EMAIL: z.email().optional(),
  ADMIN_PASSWORD: z.string().min(10, 'use at least 10 characters').optional(),
  ALERTMANAGER_WEBHOOK_TOKEN: z.string().min(16, 'use at least 16 random characters'),

  PROMETHEUS_URL: z.url().default('http://localhost:19090'),
  LOKI_URL: z.url().default('http://localhost:13100'),
  TEMPO_URL: z.url().default('http://localhost:13200'),
  ALERTMANAGER_URL: z.url().default('http://localhost:19093'),

  KUBE_CONTEXT: z.string().optional(),
  MONITORED_NAMESPACE: z.string().default('shop'),

  RUNBOOKS_DIR: z.string().optional(),

  CORRELATION_WINDOW_MINUTES: z.coerce.number().positive().default(5),
  AUTO_RESOLVE_MINUTES: z.coerce.number().positive().default(5),

  GEMINI_API_KEY: z.string().optional(),
  GEMINI_MODEL: z.string().default('gemini-3.5-flash-lite'),
  GEMINI_FALLBACK_MODEL: z.string().default('gemini-3.1-flash-lite'),
  LLM_REQUESTS_PER_MINUTE: z.coerce.number().int().positive().default(8),
  LLM_DAILY_REQUEST_BUDGET: z.coerce.number().int().positive().default(200),
  INVESTIGATION_DELAY_SECONDS: z.coerce.number().int().nonnegative().default(60),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error('OpsPilot is misconfigured:\n');
  for (const issue of parsed.error.issues) console.error(`  ${issue.path.join('.')}: ${issue.message}`);
  console.error('\nSee .env.example for every setting.');
  process.exit(1);
}

const env = parsed.data;
const isProduction = env.NODE_ENV === 'production';

if (isProduction && !env.SESSION_SECRET) {
  console.error('SESSION_SECRET is required in production.');
  process.exit(1);
}

export const config = {
  env: env.NODE_ENV,
  isProduction,
  port: env.PORT,
  mongo: { uri: env.MONGODB_URI, db: env.MONGODB_DB },
  // Without a fixed secret, sessions just don't survive a restart. Fine while developing.
  sessionSecret: env.SESSION_SECRET ?? randomBytes(32).toString('hex'),
  sessionSecretIsEphemeral: !env.SESSION_SECRET,
  admin: env.ADMIN_EMAIL && env.ADMIN_PASSWORD ? { email: env.ADMIN_EMAIL, password: env.ADMIN_PASSWORD } : null,
  webhookToken: env.ALERTMANAGER_WEBHOOK_TOKEN,
  urls: {
    prometheus: env.PROMETHEUS_URL,
    loki: env.LOKI_URL,
    tempo: env.TEMPO_URL,
    alertmanager: env.ALERTMANAGER_URL,
  },
  kube: { context: env.KUBE_CONTEXT, namespace: env.MONITORED_NAMESPACE },
  runbooksDir: env.RUNBOOKS_DIR ?? path.join(ROOT, 'runbooks'),
  correlationWindowMs: env.CORRELATION_WINDOW_MINUTES * 60_000,
  autoResolveMs: env.AUTO_RESOLVE_MINUTES * 60_000,
  llm: {
    apiKey: env.GEMINI_API_KEY,
    model: env.GEMINI_MODEL,
    fallbackModel: env.GEMINI_FALLBACK_MODEL || null,
    requestsPerMinute: env.LLM_REQUESTS_PER_MINUTE,
    dailyRequestBudget: env.LLM_DAILY_REQUEST_BUDGET,
    investigationDelayMs: env.INVESTIGATION_DELAY_SECONDS * 1000,
  },
};
