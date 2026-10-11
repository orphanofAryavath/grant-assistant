import express, { type NextFunction, type Request, type Response } from 'express';
import cors from 'cors';
import { randomUUID } from 'node:crypto';
import { ZodError } from 'zod';
import { logger } from './logger';
import { api } from './routes/api';

export const app = express();
app.use(cors());
app.use(express.json({ limit: '1mb' }));

// Request logging with a request id that is also returned to the client for support.
app.use((req, res, next) => {
  const id = randomUUID();
  const started = Date.now();
  res.setHeader('x-request-id', id);
  res.on('finish', () => {
    logger.info({ requestId: id, method: req.method, path: req.path, status: res.statusCode, durationMs: Date.now() - started }, 'request');
  });
  (req as Request & { id: string }).id = id;
  next();
});

app.use('/api', api);

app.use((err: unknown, req: Request, res: Response, _next: NextFunction) => {
  const requestId = (req as Request & { id?: string }).id;
  if (err instanceof ZodError) {
    return res.status(400).json({ error: err.issues[0]?.message ?? 'Invalid input', requestId });
  }
  const status = (err as { status?: number }).status ?? 500;
  const message = err instanceof Error ? err.message : 'Unexpected error';
  if (status >= 500) logger.error({ requestId, err: message }, 'unhandled error');
  res.status(status).json({ error: status >= 500 ? 'Something went wrong on the server.' : message, requestId });
});
