import { Router } from 'express';
import { z } from 'zod';
import { Notification } from './activity.model.js';
import { dashboard } from './activity.service.js';
import { validate } from '../../middleware/validate.js';
import { idParams, ok, pageMeta, paginationQuery } from '../../utils/http.js';
import { notFound } from '../../utils/AppError.js';

export const dashboardRouter = Router();
dashboardRouter.get('/', async (req, res) => ok(res, await dashboard(req.user)));

export const notificationsRouter = Router();

notificationsRouter.get('/', validate({ query: z.object(paginationQuery) }), async (req, res) => {
  const { page, limit } = req.valid.query;
  const filter = { user: req.user.id };
  const [items, total, unread] = await Promise.all([
    Notification.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    Notification.countDocuments(filter),
    Notification.countDocuments({ ...filter, readAt: null }),
  ]);
  ok(res, items, { ...pageMeta({ page, limit }, total), unread });
});

notificationsRouter.get('/unread-count', async (req, res) =>
  ok(res, { count: await Notification.countDocuments({ user: req.user.id, readAt: null }) })
);

notificationsRouter.patch('/:id/read', validate({ params: idParams }), async (req, res) => {
  const n = await Notification.findOneAndUpdate({ _id: req.valid.params.id, user: req.user.id }, { $set: { readAt: new Date() } }, { new: true });
  if (!n) throw notFound('Notification');
  ok(res, n);
});

notificationsRouter.post('/read-all', async (req, res) => {
  await Notification.updateMany({ user: req.user.id, readAt: null }, { $set: { readAt: new Date() } });
  ok(res, { done: true });
});
