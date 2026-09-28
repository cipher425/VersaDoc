import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { env } from '../../config/env.js';

export function signAccessToken(user) {
  return jwt.sign({ sub: String(user._id) }, env.JWT_ACCESS_SECRET, { expiresIn: env.JWT_ACCESS_TTL, issuer: 'versadoc' });
}

export function verifyAccessToken(token) {
  return jwt.verify(token, env.JWT_ACCESS_SECRET, { issuer: 'versadoc' });
}

/** Refresh tokens are opaque random strings; only their SHA-256 hash is stored. */
export const generateRefreshToken = () => crypto.randomBytes(48).toString('base64url');
export const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');

export const REFRESH_COOKIE = 'vd_rt';

export function refreshCookieOptions() {
  return {
    httpOnly: true,
    secure: env.COOKIE_SECURE,
    sameSite: env.COOKIE_SAMESITE,
    path: '/api/v1/auth',
    maxAge: env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000,
  };
}
