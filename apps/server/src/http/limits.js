import rateLimit, { ipKeyGenerator } from 'express-rate-limit';

// Rate limits count per person. A guest can start a new session whenever they like, so
// guests are counted by their address instead.
export function perPerson(req) {
  return req.user.role === 'guest' ? `guest:${ipKeyGenerator(req.ip)}` : req.user.id;
}

// A limit on something that costs model calls or changes the cluster. Only requests that went
// through count, so one that was refused (say, while another scenario runs) costs nothing.
export function limitPerPerson({ minutes, limit, error }) {
  return rateLimit({
    windowMs: minutes * 60_000,
    limit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    keyGenerator: perPerson,
    skipFailedRequests: true,
    message: { error },
  });
}
