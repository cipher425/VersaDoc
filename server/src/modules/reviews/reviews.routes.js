import { Router } from 'express';
import { z } from 'zod';
import * as service from './reviews.service.js';
import { withDocument } from '../documents/access.js';
import { validate } from '../../middleware/validate.js';
import { created, objectId, ok } from '../../utils/http.js';
import { MR_STATUS, REVIEW_STATE } from '../../config/constants.js';

/** Mounted at /documents. */
const router = Router();

const mrParams = z.object({ docId: objectId, number: z.coerce.number().int().positive() });
const commentParams = z.object({ docId: objectId, commentId: objectId });

router.get(
  '/:docId/merge-requests',
  withDocument('read'),
  validate({ query: z.object({ status: z.enum(Object.values(MR_STATUS)).optional() }) }),
  async (req, res) => ok(res, await service.listMergeRequests(req.doc, req.valid.query))
);

router.post(
  '/:docId/merge-requests',
  withDocument('edit'),
  validate({
    body: z.object({
      title: z.string().trim().min(3).max(150),
      description: z.string().trim().max(5000).optional(),
      sourceBranchId: objectId,
      targetBranchId: objectId,
      reviewers: z.array(objectId).max(10).optional(),
    }),
  }),
  async (req, res) => created(res, await service.createMergeRequest(req.doc, req.user, req.valid.body))
);

router.get('/:docId/merge-requests/:number', withDocument('read'), validate({ params: mrParams }), async (req, res) =>
  ok(res, await service.getMergeRequest(req.doc, req.valid.params.number, req.user))
);

router.get('/:docId/merge-requests/:number/conflicts', withDocument('read'), validate({ params: mrParams }), async (req, res) =>
  ok(res, await service.getConflicts(req.doc, req.valid.params.number))
);

router.post(
  '/:docId/merge-requests/:number/reviews',
  withDocument('review'),
  validate({
    params: mrParams,
    body: z.object({ state: z.enum([REVIEW_STATE.APPROVED, REVIEW_STATE.CHANGES_REQUESTED]), body: z.string().trim().max(5000).optional() }),
  }),
  async (req, res) => ok(res, await service.submitReview(req.doc, req.valid.params.number, req.user, req.valid.body))
);

router.post(
  '/:docId/merge-requests/:number/merge',
  withDocument('merge'),
  validate({
    params: mrParams,
    body: z.object({
      resolvedContent: z.string().max(2_000_000).optional(),
      deleteSourceBranch: z.boolean().optional(),
      expectedTargetHead: objectId.optional(),
    }),
  }),
  async (req, res) => ok(res, await service.mergeMergeRequest(req.doc, req.valid.params.number, req.user, req.valid.body))
);

router.post('/:docId/merge-requests/:number/close', withDocument('read'), validate({ params: mrParams }), async (req, res) =>
  ok(res, await service.setMergeRequestStatus(req.doc, req.valid.params.number, req.user, 'close'))
);

router.post('/:docId/merge-requests/:number/reopen', withDocument('read'), validate({ params: mrParams }), async (req, res) =>
  ok(res, await service.setMergeRequestStatus(req.doc, req.valid.params.number, req.user, 'reopen'))
);

router.get('/:docId/merge-requests/:number/comments', withDocument('read'), validate({ params: mrParams }), async (req, res) =>
  ok(res, await service.listComments(req.doc, req.valid.params.number))
);

router.post(
  '/:docId/merge-requests/:number/comments',
  withDocument('comment'),
  validate({
    params: mrParams,
    body: z.object({
      body: z.string().trim().min(1).max(5000),
      anchor: z.object({ side: z.enum(['old', 'new']), line: z.number().int().positive(), lineText: z.string().max(2000).optional() }).optional(),
      parent: objectId.optional(),
    }),
  }),
  async (req, res) => created(res, await service.addComment(req.doc, req.valid.params.number, req.user, req.valid.body))
);

router.patch(
  '/:docId/comments/:commentId',
  withDocument('comment'),
  validate({ params: commentParams, body: z.object({ resolved: z.boolean() }) }),
  async (req, res) => ok(res, await service.setCommentResolved(req.doc, req.valid.params.commentId, req.user, req.valid.body.resolved))
);

router.delete('/:docId/comments/:commentId', withDocument('read'), validate({ params: commentParams }), async (req, res) => {
  await service.deleteComment(req.doc, req.valid.params.commentId, req.user);
  ok(res, { deleted: true });
});

export default router;
