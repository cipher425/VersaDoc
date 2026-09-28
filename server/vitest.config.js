import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globalSetup: ['./tests/globalSetup.js'],
    setupFiles: ['./tests/setup.js'],
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 180_000,
    env: {
      NODE_ENV: 'test',
      MONGODB_URI: 'mongodb://set-by-setup',
      JWT_ACCESS_SECRET: 'test-secret-test-secret-test-secret-123456',
      BCRYPT_ROUNDS: '4',
      RATE_LIMIT_ENABLED: 'false',
      SNAPSHOT_INTERVAL: '3', // small, so tests exercise delta chains AND snapshots
      CONTENT_CACHE_SIZE: '0', // always rebuild from storage in tests
    },
  },
});
