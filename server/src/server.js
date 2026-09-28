import http from 'node:http';
import { env } from './config/env.js';
import { logger } from './infra/logger.js';
import { connectDb, disconnectDb } from './infra/db/mongoose.js';
import { closeDiffPool } from './lib/diff/pool.js';
import { createApp } from './app.js';

async function main() {
  await connectDb();
  const server = http.createServer(createApp());
  server.listen(env.PORT, () =>
    logger.info(
      { port: env.PORT, snapshotInterval: env.SNAPSHOT_INTERVAL, contentCache: env.CONTENT_CACHE_SIZE, diffWorkers: env.DIFF_WORKERS },
      'VersaDoc API listening'
    )
  );

  const shutdown = async (signal) => {
    logger.info({ signal }, 'Shutting down gracefully');
    server.close();
    await Promise.allSettled([closeDiffPool(), disconnectDb()]);
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  logger.fatal({ err }, 'Failed to start server');
  process.exit(1);
});
