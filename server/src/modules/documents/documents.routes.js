import { Router } from 'express';
import { z } from 'zod';
import * as service from './documents.service.js';
import { withDocument } from './access.js';
import { TEMPLATES } from './templates.js';
import { listActivity, documentInsights } from '../activity/activity.service.js';
import { validate } from '../../middleware/validate.js';
import { created, objectId, ok, paginationQuery } from '../../utils/http.js';
import { DOC_ROLES, VISIBILITY } from '../../config/constants.js';

const router = Router();

const role = z.enum([DOC_ROLES.EDITOR, DOC_ROLES.REVIEWER, DOC_ROLES.VIEWER]);

router.get('/templates', (_req, res) => ok(res, Object.entries(TEMPLATES).map(([id, t]) => ({ id, label: t.label }))));

router.get(
  '/',
  validate({ query: z.object({ filter: z.enum(['all', 'owned', 'shared']).default('all'), q: z.string().trim().max(80).optional(), ...paginationQuery }) }),
  async (req, res) => {
    const { items, meta } = await service.listDocuments(req.user, req.valid.query);
    ok(res, items, meta);
  }
);

router.post(
  '/',
  validate({
    body: z.object({
      title: z.string().trim().min(2).max(120),
      description: z.string().trim().max(500).optional(),
      visibility: z.enum(Object.values(VISIBILITY)).default(VISIBILITY.PRIVATE),
      template: z.enum(Object.keys(TEMPLATES)).default('blank'),
    }),
  }),
  async (req, res) => created(res, await service.createDocument(req.user, req.valid.body))
);

router.get('/:docId', withDocument('read'), async (req, res) => ok(res, await service.getDocumentDetails(req.doc, req.role)));

router.patch(
  '/:docId',
  withDocument('manage'),
  validate({
    body: z.object({
      title: z.string().trim().min(2).max(120).optional(),
      description: z.string().trim().max(500).optional(),
      visibility: z.enum(Object.values(VISIBILITY)).optional(),
      settings: z.object({ requiredApprovals: z.number().int().min(0).max(5), protectDefaultBranch: z.boolean() }).partial().optional(),
    }),
  }),
  async (req, res) => ok(res, await service.updateDocument(req.doc, req.valid.body))
);

router.delete('/:docId', withDocument('manage'), async (req, res) => {
  await service.deleteDocument(req.doc);
  ok(res, { deleted: true });
});

router.post(
  '/:docId/collaborators',
  withDocument('manage'),
  validate({ body: z.object({ email: z.string().trim().email(), role }) }),
  async (req, res) => ok(res, await service.addCollaborator(req.doc, req.user, req.valid.body))
);

router.patch(
  '/:docId/collaborators/:userId',
  withDocument('manage'),
  validate({ params: z.object({ docId: objectId, userId: objectId }), body: z.object({ role }) }),
  async (req, res) => ok(res, await service.updateCollaborator(req.doc, req.valid.params.userId, req.valid.body.role))
);

router.delete(
  '/:docId/collaborators/:userId',
  withDocument('read'),
  validate({ params: z.object({ docId: objectId, userId: objectId }) }),
  async (req, res) => ok(res, await service.removeCollaborator(req.doc, req.user, req.valid.params.userId))
);

router.get('/:docId/activity', withDocument('read'), validate({ query: z.object(paginationQuery) }), async (req, res) => {
  const { items, meta } = await listActivity(req.doc._id, req.valid.query);
  ok(res, items, meta);
});

router.get('/:docId/insights', withDocument('read'), async (req, res) => ok(res, await documentInsights(req.doc._id)));

export default router;
