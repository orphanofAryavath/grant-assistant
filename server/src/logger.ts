import pino from 'pino';
import { env } from './env';

// Structured JSON logs. Vercel captures stdout, so these show up in the function logs.
export const logger = pino({
  level: env.logLevel,
  base: { service: 'grant-assistant' },
  redact: ['req.headers.authorization', 'apiKey'],
});
