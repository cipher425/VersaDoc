import crypto from 'node:crypto';
import { Document } from './document.model.js';
import { TEMPLATES } from './templates.js';
import { roleOf } from './access.js';
import { Branch } from '../versioning/branch.model.js';
import { Commit } from '../versioning/commit.model.js';
import { Draft } from '../versioning/draft.model.js';
import { createCommit } from '../versioning/storage.service.js';
import { MergeRequest } from '../reviews/mergeRequest.model.js';
import { Comment } from '../reviews/comment.model.js';
import { Activity } from '../activity/activity.model.js';
import { notify, recordActivity } from '../activity/activity.service.js';
import { User, PUBLIC_USER_FIELDS } from '../users/user.model.js';
import { ACTIVITY, NOTIFICATION } from '../../config/constants.js';
import { withTransaction } from '../../infra/db/mongoose.js';
import { splitLines, wordCount } from '../../lib/diff/text.js';
import { escapeRegex, pageMeta } from '../../utils/http.js';
import { badRequest, conflict, forbidden, notFound } from '../../utils/AppError.js';

const slugify = (t) =>
  String(t).toLowerCase().normalize('NFKD').replace(/[^\w\s-]/g, '').trim().replace(/[\s_-]+/g, '-').slice(0, 50) || 'document';

/** Creates the document, its root commit and the "main" branch - all or nothing. */
export async function createDocument(user, { title, description, visibility, template = 'blank', content }) {
  const text = content ?? (TEMPLATES[template] || TEMPLATES.blank).content.replace('# Untitled', `# ${title}`);
  const lines = splitLines(text);
  const doc = await withTransaction(async (session) => {
    const [doc] = await Document.create(
      [
        {
          owner: user.id,
          title,
          description,
          visibility,
          slug: `${slugify(title)}-${crypto.randomBytes(3).toString('hex')}`,
          stats: { commits: 1, words: wordCount(text), lines: lines.length },
        },
      ],
      { session }
    );
    const commit = await createCommit({ documentId: doc._id, author: user.id, message: 'Initial version', lines, kind: 'initial', branchName: 'main', session });
    const [branch] = await Branch.create([{ document: doc._id, name: 'main', head: commit._id, createdFrom: commit._id, createdBy: user.id, isDefault: true }], { session });
    doc.defaultBranch = branch._id;
    await doc.save({ session });
    return doc;
  });
  // Side effects only after the transaction committed (a retried transaction must not log twice).
  await recordActivity(doc._id, user.id, ACTIVITY.DOC_CREATED, { title });
  return doc;
}

export async function listDocuments(user, { filter = 'all', q, page, limit }) {
  const query =
    filter === 'owned' ? { owner: user.id } : filter === 'shared' ? { 'collaborators.user': user.id } : { $or: [{ owner: user.id }, { 'collaborators.user': user.id }] };
  if (q) query.title = new RegExp(escapeRegex(q), 'i');
  const [items, total] = await Promise.all([
    Document.find(query)
      .sort({ lastActivityAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate('owner', PUBLIC_USER_FIELDS)
      .lean(),
    Document.countDocuments(query),
  ]);
  return {
    items: items.map((d) => ({ ...d, myRole: roleOf(d, user.id), collaboratorCount: d.collaborators.length })),
    meta: pageMeta({ page, limit }, total),
  };
}

export async function getDocumentDetails(doc, role) {
  const [populated, defaultBranch, branchCount, openMrs] = await Promise.all([
    Document.findById(doc._id).populate('owner', PUBLIC_USER_FIELDS).populate('collaborators.user', PUBLIC_USER_FIELDS).lean(),
    Branch.findById(doc.defaultBranch).select('name head').lean(),
    Branch.countDocuments({ document: doc._id }),
    MergeRequest.countDocuments({ document: doc._id, status: 'OPEN' }),
  ]);
  return { ...populated, myRole: role, defaultBranch, branchCount, openMergeRequests: openMrs };
}

export async function updateDocument(doc, changes) {
  if (changes.title !== undefined) doc.title = changes.title;
  if (changes.description !== undefined) doc.description = changes.description;
  if (changes.visibility !== undefined) doc.visibility = changes.visibility;
  for (const [key, value] of Object.entries(changes.settings || {})) doc.settings[key] = value;
  await doc.save();
  return doc;
}

export async function deleteDocument(doc) {
  const id = doc._id;
  await Promise.all([
    Commit.deleteMany({ document: id }),
    Branch.deleteMany({ document: id }),
    Draft.deleteMany({ document: id }),
    MergeRequest.deleteMany({ document: id }),
    Comment.deleteMany({ document: id }),
    Activity.deleteMany({ document: id }),
  ]);
  await doc.deleteOne();
}

export async function addCollaborator(doc, actor, { email, role }) {
  const user = await User.findOne({ email: email.toLowerCase() }).select('name email').lean();
  if (!user) throw notFound('No VersaDoc account uses that email');
  if (String(user._id) === String(doc.owner)) throw badRequest('The owner already has full access');
  if (doc.collaborators.some((c) => String(c.user) === String(user._id))) throw conflict('This person is already a collaborator');
  doc.collaborators.push({ user: user._id, role });
  await doc.save();
  await recordActivity(doc._id, actor.id, ACTIVITY.COLLABORATOR_ADDED, { name: user.name, role });
  await notify([user._id], {
    type: NOTIFICATION.ADDED_TO_DOCUMENT,
    title: `${actor.name} added you to "${doc.title}"`,
    body: `You are now a ${role}.`,
    link: `/d/${doc._id}`,
  });
  return doc;
}

export async function updateCollaborator(doc, userId, role) {
  const c = doc.collaborators.find((col) => String(col.user) === String(userId));
  if (!c) throw notFound('Collaborator');
  c.role = role;
  await doc.save();
  return doc;
}

export async function removeCollaborator(doc, actor, userId) {
  const isSelf = String(userId) === actor.id;
  if (!isSelf && String(doc.owner) !== actor.id) throw forbidden('Only the owner can remove collaborators');
  const before = doc.collaborators.length;
  doc.collaborators = doc.collaborators.filter((c) => String(c.user) !== String(userId));
  if (doc.collaborators.length === before) throw notFound('Collaborator');
  await doc.save();
  // Their pending review requests no longer make sense.
  await MergeRequest.updateMany({ document: doc._id, status: 'OPEN' }, { $pull: { reviewers: { user: userId } } });
  return doc;
}
