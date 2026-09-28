import { rateLimit, ipKeyGenerator } from 'express-rate-limit';
import { env } from '../config/env.js';

function limiter({ windowMs, limit, byUser = false, message }) {
  if (!env.RATE_LIMIT_ENABLED) return (_req, _res, next) => next();
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    keyGenerator: (req) => (byUser && req.user ? `u:${req.user.id}` : ipKeyGenerator(req.ip)),
    handler: (_req, res) => res.status(429).json({ error: { code: 'RATE_LIMITED', message: message || 'Too many requests, slow down' } }),
  });
}

export const apiLimiter = limiter({ windowMs: 60_000, limit: 600 });
export const authLimiter = limiter({ windowMs: 15 * 60_000, limit: 30, message: 'Too many login attempts. Try again in a few minutes.' });
// Autosave fires often; this only stops scripts hammering the write endpoints.
export const writeLimiter = limiter({ windowMs: 60_000, limit: 120, byUser: true, message: 'You are saving too fast. Please wait a moment.' });
