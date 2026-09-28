import { Router } from 'express';
import authRoutes from './modules/auth/auth.routes.js';
import usersRoutes from './modules/users/users.routes.js';
import documentsRoutes from './modules/documents/documents.routes.js';
import versioningRoutes from './modules/versioning/versioning.routes.js';
import reviewsRoutes from './modules/reviews/reviews.routes.js';
import publicRoutes from './modules/public/public.routes.js';
import { dashboardRouter, notificationsRouter } from './modules/activity/activity.routes.js';
import { requireAuth } from './middleware/auth.js';
import { cacheStats } from './modules/versioning/storage.service.js';
import { env } from './config/env.js';

const router = Router();

router.use('/auth', authRoutes);
router.use('/public', publicRoutes);
router.use('/users', usersRoutes);

// Everything below needs a logged-in user; document-level permissions are checked per route.
router.use('/documents', requireAuth, documentsRoutes, versioningRoutes, reviewsRoutes);
router.use('/dashboard', requireAuth, dashboardRouter);
router.use('/notifications', requireAuth, notificationsRouter);

// Handy while benchmarking (Stage 2/3): see the current storage/perf configuration and cache hit rate.
router.get('/system/stats', requireAuth, (_req, res) =>
  res.json({
    data: {
      snapshotInterval: env.SNAPSHOT_INTERVAL,
      diffWorkers: env.DIFF_WORKERS,
      contentCache: cacheStats(),
      memoryMB: Math.round(process.memoryUsage().rss / 1024 / 1024),
    },
  })
);

export default router;
