import pino from 'pino';
import { config } from './config.js';

export const logger = pino({
  level: process.env.LOG_LEVEL || (config.isProduction ? 'info' : 'debug'),
  transport: config.isProduction ? undefined : { target: 'pino-pretty', options: { ignore: 'pid,hostname' } },
});
