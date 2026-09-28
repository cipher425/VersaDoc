import { Router } from 'express';
import { Document } from '../documents/document.model.js';
import { Branch } from '../versioning/branch.model.js';
import { commitMeta } from '../versioning/history.service.js';
import { getContent } from '../versioning/storage.service.js';
import { VISIBILITY } from '../../config/constants.js';
import { ok } from '../../utils/http.js';
import { notFound } from '../../utils/AppError.js';

/** Read-only published view of public documents (no login needed). */
const router = Router();

router.get('/:slug', async (req, res) => {
  const doc = await Document.findOne({ slug: String(req.params.slug), visibility: VISIBILITY.PUBLIC })
    .select('title description slug owner defaultBranch stats updatedAt collaborators')
    .populate('owner', 'name avatarColor')
    .lean();
  if (!doc) throw notFound('Document');
  const branch = await Branch.findById(doc.defaultBranch).select('name head').lean();
  const [head] = await commitMeta([branch.head]);
  res.set('Cache-Control', 'public, max-age=60');
  ok(res, {
    title: doc.title,
    description: doc.description,
    owner: doc.owner,
    contributors: doc.collaborators.length + 1,
    commits: doc.stats.commits,
    words: doc.stats.words,
    branch: branch.name,
    lastUpdated: head.createdAt,
    lastCommit: { hash: head.hash, message: head.message, author: { name: head.author?.name } },
    content: await getContent(branch.head),
  });
});

export default router;
