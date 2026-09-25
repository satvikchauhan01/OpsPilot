import { z } from 'zod';
import { logger } from '../logger.js';

export class HttpError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

export const notFound = (what = 'resource') => new HttpError(404, `${what} not found`);

// Parses a request part against a zod schema and turns failures into a 400.
export function parse(schema, value) {
  const result = schema.safeParse(value);
  if (!result.success) {
    const issues = result.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message }));
    throw new HttpError(400, 'invalid request', issues);
  }
  return result.data;
}

export function handleApiNotFound(req, res) {
  res.status(404).json({ error: `no route for ${req.method} ${req.originalUrl}` });
}

export function handleErrors(err, req, res, _next) {
  if (err instanceof z.ZodError) err = new HttpError(400, 'invalid request', err.issues);
  // express.json() reports malformed bodies with a status of its own
  const status = err.status ?? err.statusCode ?? 500;
  // Messages we wrote ourselves are safe to show; anything unexpected might leak internals.
  const expected = err instanceof HttpError || status < 500;

  if (!expected) logger.error({ err, method: req.method, url: req.originalUrl }, 'request failed');
  res.status(status).json({
    error: expected ? err.message : 'something went wrong on our side',
    ...(err.details && { details: err.details }),
  });
}
