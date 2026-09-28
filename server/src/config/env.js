import 'dotenv/config';
import { z } from 'zod';

const bool = (def) =>
  z
    .enum(['true', 'false'])
    .default(def ? 'true' : 'false')
    .transform((v) => v === 'true');

const schema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().default(5000),
    MONGODB_URI: z.string().min(1, 'MONGODB_URI is required'),
    CLIENT_URL: z.string().default('http://localhost:5173'),

    JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET must be at least 32 characters'),
    JWT_ACCESS_TTL: z.string().default('15m'),
    REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(7),
    BCRYPT_ROUNDS: z.coerce.number().int().min(4).max(15).default(12),
    COOKIE_SAMESITE: z.enum(['lax', 'strict', 'none']).default('lax'),
    COOKIE_SECURE: bool(false),
    RATE_LIMIT_ENABLED: bool(true),

    MAX_DOCUMENT_BYTES: z.coerce.number().int().positive().default(512_000),
    SNAPSHOT_INTERVAL: z.coerce.number().int().min(1).max(500).default(20),
    CONTENT_CACHE_SIZE: z.coerce.number().int().min(0).default(0),
    DIFF_WORKERS: z.coerce.number().int().min(0).max(16).default(0),
    WORKER_THRESHOLD_LINES: z.coerce.number().int().min(0).default(2000),
    MAX_DIFF_EDITS: z.coerce.number().int().min(100).default(20_000),
  })
  .superRefine((e, ctx) => {
    if (e.COOKIE_SAMESITE === 'none' && !e.COOKIE_SECURE) {
      ctx.addIssue({ code: 'custom', message: 'COOKIE_SAMESITE=none requires COOKIE_SECURE=true' });
    }
  });

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error('Invalid environment configuration:');
  for (const issue of parsed.error.issues) console.error(` - ${issue.path.join('.') || 'env'}: ${issue.message}`);
  process.exit(1);
}

export const env = Object.freeze({
  ...parsed.data,
  isProd: parsed.data.NODE_ENV === 'production',
  isTest: parsed.data.NODE_ENV === 'test',
  clientOrigins: parsed.data.CLIENT_URL.split(',').map((s) => s.trim()),
});
