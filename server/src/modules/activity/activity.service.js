import mongoose from 'mongoose';
import { Activity, Notification } from './activity.model.js';
import { Document } from '../documents/document.model.js';
import { Commit } from '../versioning/commit.model.js';
import { MergeRequest } from '../reviews/mergeRequest.model.js';
import { MR_STATUS } from '../../config/constants.js';
import { PUBLIC_USER_FIELDS } from '../users/user.model.js';
import { logger } from '../../infra/logger.js';
import { pageMeta } from '../../utils/http.js';

/** Side effects must never break the main action: failures are logged, not thrown. */
export async function recordActivity(documentId, actorId, type, data = {}) {
  try {
    await Activity.create({ document: documentId, actor: actorId, type, data });
    await Document.updateOne({ _id: documentId }, { $set: { lastActivityAt: new Date() } });
  } catch (err) {
    logger.warn({ err }, 'Failed to record activity');
  }
}

export async function notify(userIds, { type, title, body, link }, { except } = {}) {
  const targets = [...new Set(userIds.map(String))].filter((id) => id !== String(except));
  if (!targets.length) return;
  try {
    await Notification.insertMany(targets.map((user) => ({ user, type, title, body, link })));
  } catch (err) {
    logger.warn({ err }, 'Failed to create notifications');
  }
}

export async function listActivity(documentId, { page = 1, limit = 30 }) {
  const [items, total] = await Promise.all([
    Activity.find({ document: documentId })
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate('actor', PUBLIC_USER_FIELDS)
      .lean(),
    Activity.countDocuments({ document: documentId }),
  ]);
  return { items, meta: pageMeta({ page, limit }, total) };
}

/** Numbers and charts for the Insights tab. */
export async function documentInsights(documentId) {
  const id = new mongoose.Types.ObjectId(String(documentId));
  const since = new Date(Date.now() - 90 * 86_400_000);
  const [perDay, contributors, storage, mrs] = await Promise.all([
    Commit.aggregate([
      { $match: { document: id, createdAt: { $gte: since } } },
      { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, commits: { $sum: 1 }, additions: { $sum: '$stats.additions' }, deletions: { $sum: '$stats.deletions' } } },
      { $sort: { _id: 1 } },
    ]),
    Commit.aggregate([
      { $match: { document: id } },
      { $group: { _id: '$author', commits: { $sum: 1 }, additions: { $sum: '$stats.additions' }, deletions: { $sum: '$stats.deletions' }, last: { $max: '$createdAt' } } },
      { $sort: { commits: -1 } },
      { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'user', pipeline: [{ $project: { name: 1, avatarColor: 1 } }] } },
      { $unwind: '$user' },
    ]),
    Commit.aggregate([
      { $match: { document: id } },
      {
        $group: {
          _id: null,
          commits: { $sum: 1 },
          snapshots: { $sum: { $cond: [{ $eq: ['$storage', 'snapshot'] }, 1, 0] } },
          storedBytes: { $sum: '$stats.storedBytes' },
          fullBytes: { $sum: '$stats.fullBytes' },
        },
      },
    ]),
    MergeRequest.aggregate([{ $match: { document: id } }, { $group: { _id: '$status', count: { $sum: 1 } } }]),
  ]);
  const s = storage[0] || { commits: 0, snapshots: 0, storedBytes: 0, fullBytes: 0 };
  return {
    perDay: perDay.map((d) => ({ date: d._id, commits: d.commits, additions: d.additions, deletions: d.deletions })),
    contributors: contributors.map((c) => ({ user: c.user, commits: c.commits, additions: c.additions, deletions: c.deletions, last: c.last })),
    storage: {
      ...s,
      deltas: s.commits - s.snapshots,
      // How much space delta storage saved compared to storing every version in full.
      savedPercent: s.fullBytes ? Math.round((1 - s.storedBytes / s.fullBytes) * 100) : 0,
    },
    mergeRequests: Object.fromEntries(mrs.map((m) => [m._id, m.count])),
  };
}

export async function dashboard(user) {
  const mine = { $or: [{ owner: user.id }, { 'collaborators.user': user.id }] };
  const docs = await Document.find(mine).select('_id').lean();
  const docIds = docs.map((d) => d._id);
  const [recentDocs, reviewRequests, myOpenMrs, activity] = await Promise.all([
    Document.find(mine).sort({ lastActivityAt: -1 }).limit(6).select('title slug description visibility stats lastActivityAt owner').populate('owner', PUBLIC_USER_FIELDS).lean(),
    MergeRequest.find({ 'reviewers.user': user.id, status: MR_STATUS.OPEN })
      .populate('author', PUBLIC_USER_FIELDS)
      .populate('document', 'title')
      .sort({ updatedAt: -1 })
      .limit(10)
      .lean(),
    MergeRequest.find({ author: user.id, status: MR_STATUS.OPEN }).populate('document', 'title').sort({ updatedAt: -1 }).limit(10).lean(),
    Activity.find({ document: { $in: docIds } })
      .sort({ createdAt: -1 })
      .limit(15)
      .populate('actor', PUBLIC_USER_FIELDS)
      .populate('document', 'title')
      .lean(),
  ]);
  return {
    recentDocs,
    // Only reviews still waiting on me.
    reviewRequests: reviewRequests.filter((mr) => mr.reviewers.some((r) => String(r.user) === user.id && r.state === 'PENDING')),
    myOpenMrs,
    activity,
    counts: { documents: docIds.length },
  };
}
