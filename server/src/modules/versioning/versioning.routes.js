import { Router } from 'express';
import { z } from 'zod';
import * as service from './versioning.service.js';
import { blame, branchLog, resolveRef } from './history.service.js';
import { withDocument } from '../documents/access.js';
import { validate } from '../../middleware/validate.js';
import { writeLimiter } from '../../middleware/rateLimits.js';
import { created, objectId, ok } from '../../utils/http.js';

/** Mounted at /documents - every path starts with /:docId. */
const router = Router();

const branchParams = z.object({ docId: objectId, branchId: objectId });
const commitParams = z.object({ docId: objectId, commitId: objectId });

// Branches
router.get('/:docId/branches', withDocument('read'), async (req, res) => ok(res, await service.listBranches(req.doc)));

router.post(
  '/:docId/branches',
  withDocument('edit'),
  validate({ body: z.object({ name: z.string().trim().min(1).max(50), from: z.string().trim().min(1).max(60) }) }),
  async (req, res) => created(res, await service.createBranch(req.doc, req.user, req.valid.body))
);

router.get('/:docId/branches/:branchId', withDocument('read'), validate({ params: branchParams }), async (req, res) =>
  ok(res, await service.branchContent(req.doc, req.valid.params.branchId))
);

router.delete('/:docId/branches/:branchId', withDocument('edit'), validate({ params: branchParams }), async (req, res) => {
  await service.deleteBranch(req.doc, req.user, req.valid.params.branchId);
  ok(res, { deleted: true });
});

// Drafts (autosaved working copy)
router.get('/:docId/branches/:branchId/draft', withDocument('read'), validate({ params: branchParams }), async (req, res) =>
  ok(res, await service.getDraft(req.doc, req.valid.params.branchId, req.user))
);

router.put(
  '/:docId/branches/:branchId/draft',
  withDocument('edit'),
  writeLimiter,
  validate({ params: branchParams, body: z.object({ content: z.string().max(2_000_000), baseCommit: objectId }) }),
  async (req, res) => ok(res, await service.saveDraft(req.doc, req.valid.params.branchId, req.user, req.valid.body))
);

router.get('/:docId/branches/:branchId/draft/diff', withDocument('read'), validate({ params: branchParams }), async (req, res) =>
  ok(res, await service.draftDiff(req.doc, req.valid.params.branchId, req.user))
);

router.delete('/:docId/branches/:branchId/draft', withDocument('edit'), validate({ params: branchParams }), async (req, res) => {
  await service.discardDraft(req.doc, req.valid.params.branchId, req.user);
  ok(res, { discarded: true });
});

router.post(
  '/:docId/branches/:branchId/draft/rebase',
  withDocument('edit'),
  validate({ params: branchParams, body: z.object({ resolvedContent: z.string().max(2_000_000).optional() }) }),
  async (req, res) => ok(res, await service.rebaseDraft(req.doc, req.valid.params.branchId, req.user, req.valid.body))
);

// Commits
router.post(
  '/:docId/branches/:branchId/commits',
  withDocument('edit'),
  writeLimiter,
  validate({ params: branchParams, body: z.object({ message: z.string().trim().min(3, 'Describe your change in a few words').max(500) }) }),
  async (req, res) => created(res, await service.commitDraft(req.doc, req.valid.params.branchId, req.user, req.valid.body))
);

router.post(
  '/:docId/branches/:branchId/restore',
  withDocument('edit'),
  validate({ params: branchParams, body: z.object({ commitId: objectId }) }),
  async (req, res) => created(res, await service.restoreVersion(req.doc, req.valid.params.branchId, req.user, req.valid.body))
);

router.get('/:docId/branches/:branchId/blame', withDocument('read'), validate({ params: branchParams }), async (req, res) => {
  const branch = await service.getBranch(req.doc, req.valid.params.branchId);
  ok(res, await blame(req.doc._id, branch.head));
});

router.get(
  '/:docId/commits',
  withDocument('read'),
  validate({
    query: z.object({
      ref: z.string().trim().min(1).max(60),
      page: z.coerce.number().int().min(1).default(1),
      limit: z.coerce.number().int().min(1).max(100).default(30),
    }),
  }),
  async (req, res) => {
    const head = await resolveRef(req.doc._id, req.valid.query.ref);
    const { items, total } = await branchLog(req.doc._id, head, req.valid.query);
    const { page, limit } = req.valid.query;
    ok(res, items, { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) });
  }
);

router.get('/:docId/commits/:commitId', withDocument('read'), validate({ params: commitParams }), async (req, res) =>
  ok(res, await service.commitDetails(req.doc, req.valid.params.commitId))
);

router.get('/:docId/commits/:commitId/content', withDocument('read'), validate({ params: commitParams }), async (req, res) => {
  const { hash, content } = await service.commitContent(req.doc, req.valid.params.commitId);
  if (req.query.download) {
    res.set('Content-Type', 'text/markdown; charset=utf-8');
    res.set('Content-Disposition', `attachment; filename="${req.doc.slug}-${hash.slice(0, 7)}.md"`);
    return res.send(content);
  }
  ok(res, { hash, content });
});

router.get(
  '/:docId/compare',
  withDocument('read'),
  validate({ query: z.object({ from: z.string().trim().min(1).max(60), to: z.string().trim().min(1).max(60) }) }),
  async (req, res) => ok(res, await service.compare(req.doc, req.valid.query.from, req.valid.query.to))
);

export default router;
