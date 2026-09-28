import { MergeRequest } from './mergeRequest.model.js';
import { Comment } from './comment.model.js';
import { Branch } from '../versioning/branch.model.js';
import { Commit } from '../versioning/commit.model.js';
import { Document } from '../documents/document.model.js';
import { can, roleOf } from '../documents/access.js';
import { createCommit, getLines } from '../versioning/storage.service.js';
import { commitMeta, loadGraph } from '../versioning/history.service.js';
import { getBranch } from '../versioning/versioning.service.js';
import { notify, recordActivity } from '../activity/activity.service.js';
import { ancestors, countAhead, isAncestor, mergeBase } from '../../lib/diff/graph.js';
import { CONFLICT_MARKER_RE, withConflictMarkers } from '../../lib/diff/merge3.js';
import { runDiffTask } from '../../lib/diff/pool.js';
import { normalize, splitLines } from '../../lib/diff/text.js';
import { ACTIVITY, MR_STATUS, NOTIFICATION, REVIEW_STATE } from '../../config/constants.js';
import { env } from '../../config/env.js';
import { PUBLIC_USER_FIELDS } from '../users/user.model.js';
import { AppError, badRequest, conflict, forbidden, notFound } from '../../utils/AppError.js';

const diffOpts = () => ({ maxEdits: env.MAX_DIFF_EDITS });
const mrLink = (doc, number) => `/d/${doc._id}/merge-requests/${number}`;

async function getMr(doc, number) {
  const mr = await MergeRequest.findOne({ document: doc._id, number });
  if (!mr) throw notFound('Merge request');
  return mr;
}

/**
 * Everything the merge page needs to know, computed from the commit graph:
 *   base      = merge base (common ancestor of source and target)
 *   state     = UP_TO_DATE (nothing to merge) | FAST_FORWARD | CLEAN | CONFLICTS
 */
async function analyze(doc, mr) {
  const [source, target] = await Promise.all([Branch.findById(mr.sourceBranch).lean(), Branch.findById(mr.targetBranch).lean()]);
  if (!source || !target) return { missingBranch: true };
  const graph = await loadGraph(doc._id);
  const sourceHead = String(source.head);
  const targetHead = String(target.head);
  const base = mergeBase(graph, sourceHead, targetHead);
  const ahead = countAhead(graph, sourceHead, targetHead);
  const behind = countAhead(graph, targetHead, sourceHead);

  let state;
  let merge = null;
  if (isAncestor(graph, sourceHead, targetHead)) state = 'UP_TO_DATE';
  else if (base === targetHead) state = 'FAST_FORWARD';
  else {
    const [b, t, s] = await Promise.all([getLines(base), getLines(targetHead), getLines(sourceHead)]);
    merge = await runDiffTask('merge3', [b, t, s, diffOpts()], Math.max(b.length, t.length, s.length));
    state = merge.clean ? 'CLEAN' : 'CONFLICTS';
  }
  return { source, target, sourceHead, targetHead, base, ahead, behind, state, merge };
}

/** Approvals only count if they were given on the CURRENT version of the source branch. */
function approvalSummary(doc, mr, sourceHead) {
  const current = (r) => r.reviewedHead && String(r.reviewedHead) === String(sourceHead);
  const approvals = mr.reviewers.filter((r) => r.state === REVIEW_STATE.APPROVED && current(r)).length;
  const changesRequested = mr.reviewers.some((r) => r.state === REVIEW_STATE.CHANGES_REQUESTED && current(r));
  const stale = mr.reviewers.filter((r) => r.state !== REVIEW_STATE.PENDING && !current(r)).length;
  return { approvals, required: doc.settings.requiredApprovals, changesRequested, stale };
}

export async function createMergeRequest(doc, user, { title, description, sourceBranchId, targetBranchId, reviewers = [] }) {
  if (String(sourceBranchId) === String(targetBranchId)) throw badRequest('Source and target must be different branches');
  const [source, target] = await Promise.all([getBranch(doc, sourceBranchId), getBranch(doc, targetBranchId)]);
  const graph = await loadGraph(doc._id);
  if (countAhead(graph, String(source.head), String(target.head)) === 0) {
    throw badRequest(`"${source.name}" has no changes that "${target.name}" doesn't already have`, undefined, 'NOTHING_TO_MERGE');
  }
  const existing = await MergeRequest.findOne({ document: doc._id, sourceBranch: source._id, targetBranch: target._id, status: MR_STATUS.OPEN }).lean();
  if (existing) throw conflict(`Merge request !${existing.number} already exists for these branches`, { number: existing.number }, 'MR_EXISTS');

  const reviewerIds = [...new Set(reviewers.map(String))].filter((id) => id !== user.id);
  for (const id of reviewerIds) {
    if (!can(doc, id, 'review') || !roleOf(doc, id)) throw badRequest('Reviewers must be collaborators with reviewer access or higher');
  }

  // Atomic counter -> human-friendly numbers (!1, !2, ...) without duplicates under concurrency.
  const { mrCounter } = await Document.findByIdAndUpdate(doc._id, { $inc: { mrCounter: 1 } }, { new: true, projection: { mrCounter: 1 } });
  const mr = await MergeRequest.create({
    document: doc._id,
    number: mrCounter,
    title,
    description,
    author: user.id,
    sourceBranch: source._id,
    targetBranch: target._id,
    sourceBranchName: source.name,
    targetBranchName: target.name,
    reviewers: reviewerIds.map((id) => ({ user: id })),
  });
  await recordActivity(doc._id, user.id, ACTIVITY.MR_OPENED, { number: mr.number, title, source: source.name, target: target.name });
  await notify(reviewerIds, {
    type: NOTIFICATION.REVIEW_REQUESTED,
    title: `${user.name} requested your review on !${mr.number}`,
    body: `${title} - ${doc.title}`,
    link: mrLink(doc, mr.number),
  });
  return mr;
}

export async function listMergeRequests(doc, { status }) {
  const filter = { document: doc._id };
  if (status) filter.status = status;
  const items = await MergeRequest.find(filter).sort({ updatedAt: -1 }).populate('author', PUBLIC_USER_FIELDS).populate('reviewers.user', PUBLIC_USER_FIELDS).lean();
  const counts = await Comment.aggregate([{ $match: { document: doc._id } }, { $group: { _id: '$mergeRequest', n: { $sum: 1 } } }]);
  const byMr = new Map(counts.map((c) => [String(c._id), c.n]));
  return items.map((mr) => ({ ...mr, commentCount: byMr.get(String(mr._id)) || 0 }));
}

export async function getMergeRequest(doc, number, user) {
  const mr = await getMr(doc, number);
  const populated = await MergeRequest.findById(mr._id)
    .populate('author', PUBLIC_USER_FIELDS)
    .populate('reviewers.user', PUBLIC_USER_FIELDS)
    .populate('mergedBy', PUBLIC_USER_FIELDS)
    .lean();

  let analysis = null;
  let diff = null;
  let commits = [];
  if (mr.status === MR_STATUS.OPEN) {
    analysis = await analyze(doc, mr);
    if (!analysis.missingBranch) {
      // "Changes in this MR" = merge base -> source head (not target -> source, which would
      // also show everything that happened on the target meanwhile).
      const [b, s] = await Promise.all([getLines(analysis.base), getLines(analysis.sourceHead)]);
      diff = await runDiffTask('diffView', [b, s, diffOpts()], Math.max(b.length, s.length));
      // Commits in this MR = reachable from source but not from target.
      const graph = await loadGraph(doc._id);
      const fromTarget = ancestors(graph, analysis.targetHead);
      const ids = [...ancestors(graph, analysis.sourceHead)].filter((id) => !fromTarget.has(id));
      commits = (await commitMeta(ids)).sort((a, b) => a.generation - b.generation);
    }
  } else if (mr.status === MR_STATUS.MERGED && mr.mergeCommit) {
    const merge = await Commit.findById(mr.mergeCommit).select('parents').lean();
    if (merge?.parents?.length) {
      const [before, after] = await Promise.all([getLines(merge.parents[0]), getLines(mr.mergeCommit)]);
      diff = await runDiffTask('diffView', [before, after, diffOpts()], Math.max(before.length, after.length));
    }
  }

  const summary = analysis && !analysis.missingBranch ? approvalSummary(doc, mr, analysis.sourceHead) : null;
  const isAuthor = String(mr.author) === user.id;
  const canMergeRole = can(doc, user.id, 'merge');
  const blockers = [];
  if (summary) {
    if (analysis.state === 'UP_TO_DATE') blockers.push('Nothing to merge - the target already contains these changes');
    if (summary.approvals < summary.required) blockers.push(`Needs ${summary.required - summary.approvals} more approval(s)`);
    if (summary.changesRequested) blockers.push('A reviewer requested changes');
    if (!canMergeRole) blockers.push('You need editor access to merge');
  }

  return {
    ...populated,
    analysis: analysis && !analysis.missingBranch
      ? {
          state: analysis.state,
          ahead: analysis.ahead,
          behind: analysis.behind,
          sourceHead: analysis.sourceHead,
          targetHead: analysis.targetHead,
          base: analysis.base,
          conflictCount: analysis.merge?.conflictCount ?? 0,
        }
      : analysis,
    approvals: summary,
    diff,
    commits,
    permissions: {
      canReview: !isAuthor && can(doc, user.id, 'review'),
      canMerge: canMergeRole && mr.status === MR_STATUS.OPEN,
      canClose: mr.status === MR_STATUS.OPEN && (isAuthor || canMergeRole),
      canReopen: mr.status === MR_STATUS.CLOSED && (isAuthor || canMergeRole),
      canComment: can(doc, user.id, 'comment'),
    },
    blockers,
  };
}

export async function getConflicts(doc, number) {
  const mr = await getMr(doc, number);
  if (mr.status !== MR_STATUS.OPEN) throw badRequest('This merge request is not open');
  const a = await analyze(doc, mr);
  if (a.missingBranch) throw badRequest('A branch of this merge request was deleted');
  if (a.state !== 'CONFLICTS') return { state: a.state, conflictCount: 0, chunks: [] };
  return {
    state: a.state,
    conflictCount: a.merge.conflictCount,
    chunks: a.merge.chunks,
    labels: { ours: `${mr.targetBranchName} (current)`, theirs: `${mr.sourceBranchName} (incoming)` },
    withMarkers: withConflictMarkers(a.merge.chunks, mr.targetBranchName, mr.sourceBranchName),
    targetHead: a.targetHead,
    sourceHead: a.sourceHead,
  };
}

export async function submitReview(doc, number, user, { state, body }) {
  const mr = await getMr(doc, number);
  if (mr.status !== MR_STATUS.OPEN) throw badRequest('This merge request is not open');
  if (String(mr.author) === user.id) throw forbidden('You cannot review your own merge request');
  if (!can(doc, user.id, 'review')) throw forbidden('You need reviewer access');
  const source = await Branch.findById(mr.sourceBranch).select('head').lean();
  if (!source) throw badRequest('The source branch was deleted');

  const entry = mr.reviewers.find((r) => String(r.user) === user.id);
  if (entry) Object.assign(entry, { state, reviewedHead: source.head, reviewedAt: new Date() });
  else mr.reviewers.push({ user: user.id, state, reviewedHead: source.head, reviewedAt: new Date() });
  await mr.save();

  if (body) await Comment.create({ document: doc._id, mergeRequest: mr._id, author: user.id, body, reviewState: state });
  await recordActivity(doc._id, user.id, ACTIVITY.REVIEW, { number: mr.number, state });
  await notify([mr.author], {
    type: NOTIFICATION.REVIEW_SUBMITTED,
    title: state === REVIEW_STATE.APPROVED ? `${user.name} approved !${mr.number}` : `${user.name} requested changes on !${mr.number}`,
    body: mr.title,
    link: mrLink(doc, mr.number),
  });
  return mr;
}

/**
 * Merge. Every guard runs on the server: status, role, approvals (on the current version),
 * requested changes, conflicts. The target branch moves with a conditional update, so two
 * people merging at the same moment can't both succeed.
 */
export async function mergeMergeRequest(doc, number, user, { resolvedContent, deleteSourceBranch = false, expectedTargetHead }) {
  const mr = await getMr(doc, number);
  if (mr.status !== MR_STATUS.OPEN) throw badRequest('This merge request is not open');
  if (!can(doc, user.id, 'merge')) throw forbidden('You need editor access to merge');
  const a = await analyze(doc, mr);
  if (a.missingBranch) throw badRequest('A branch of this merge request was deleted');
  if (a.state === 'UP_TO_DATE') throw badRequest('Nothing to merge', undefined, 'NOTHING_TO_MERGE');

  const s = approvalSummary(doc, mr, a.sourceHead);
  if (s.approvals < s.required) throw new AppError(409, 'APPROVALS_REQUIRED', `This document requires ${s.required} approval(s) on the latest changes`);
  if (s.changesRequested) throw new AppError(409, 'CHANGES_REQUESTED', 'A reviewer requested changes');

  let mergeCommitId;
  let fastForward = false;
  const target = await Branch.findById(mr.targetBranch);

  if (a.state === 'FAST_FORWARD' && resolvedContent === undefined) {
    fastForward = true;
    mergeCommitId = a.sourceHead;
    const moved = await Branch.findOneAndUpdate({ _id: target._id, head: a.targetHead }, { $set: { head: a.sourceHead } });
    if (!moved) throw conflict('The target branch changed while merging. Please try again.', undefined, 'TARGET_MOVED');
  } else {
    let lines;
    if (a.state === 'CONFLICTS' || resolvedContent !== undefined) {
      if (resolvedContent === undefined) {
        throw new AppError(409, 'MERGE_CONFLICTS', `There are ${a.merge.conflictCount} conflict(s) to resolve`, { conflictCount: a.merge.conflictCount });
      }
      // The resolution was made against specific heads; refuse if the target moved meanwhile.
      if (expectedTargetHead && String(expectedTargetHead) !== a.targetHead) {
        throw conflict('The target branch changed while you were resolving. Please review the conflicts again.', undefined, 'TARGET_MOVED');
      }
      if (CONFLICT_MARKER_RE.test(resolvedContent)) throw badRequest('Remove all conflict markers before merging', undefined, 'UNRESOLVED_CONFLICTS');
      lines = splitLines(normalize(resolvedContent));
    } else {
      lines = a.merge.lines;
    }
    const commit = await createCommit({
      documentId: doc._id,
      parents: [a.targetHead, a.sourceHead], // two parents = a merge commit
      author: user.id,
      message: `Merge branch '${mr.sourceBranchName}' into '${mr.targetBranchName}' (!${mr.number})`,
      lines,
      kind: 'merge',
      branchName: mr.targetBranchName,
      mergeInfo: { sourceBranch: mr.sourceBranchName, targetBranch: mr.targetBranchName, mergeRequestNumber: mr.number },
    });
    const moved = await Branch.findOneAndUpdate({ _id: target._id, head: a.targetHead }, { $set: { head: commit._id } });
    if (!moved) {
      await Commit.deleteOne({ _id: commit._id });
      throw conflict('The target branch changed while merging. Please try again.', undefined, 'TARGET_MOVED');
    }
    mergeCommitId = commit._id;
    await Document.updateOne(
      { _id: doc._id },
      { $inc: { 'stats.commits': 1 }, ...(target.isDefault ? { $set: { 'stats.words': commit.stats.words, 'stats.lines': commit.stats.lines } } : {}) }
    );
  }

  mr.status = MR_STATUS.MERGED;
  mr.mergedBy = user.id;
  mr.mergedAt = new Date();
  mr.mergeCommit = mergeCommitId;
  mr.fastForward = fastForward;
  await mr.save();

  if (deleteSourceBranch) {
    const source = await Branch.findById(mr.sourceBranch);
    if (source && !source.isDefault) {
      await MergeRequest.updateMany({ document: doc._id, status: MR_STATUS.OPEN, $or: [{ sourceBranch: source._id }, { targetBranch: source._id }] }, { $set: { status: MR_STATUS.CLOSED, closedAt: new Date() } });
      await source.deleteOne();
    }
  }
  await recordActivity(doc._id, user.id, ACTIVITY.MR_MERGED, { number: mr.number, title: mr.title, source: mr.sourceBranchName, target: mr.targetBranchName, fastForward });
  await notify([mr.author], { type: NOTIFICATION.MR_MERGED, title: `!${mr.number} was merged`, body: mr.title, link: mrLink(doc, mr.number) }, { except: user.id });
  return mr;
}

export async function setMergeRequestStatus(doc, number, user, action) {
  const mr = await getMr(doc, number);
  const allowed = String(mr.author) === user.id || can(doc, user.id, 'merge');
  if (!allowed) throw forbidden('Only the author or an editor can do this');
  if (action === 'close') {
    if (mr.status !== MR_STATUS.OPEN) throw badRequest('Only open merge requests can be closed');
    mr.status = MR_STATUS.CLOSED;
    mr.closedAt = new Date();
  } else {
    if (mr.status !== MR_STATUS.CLOSED) throw badRequest('Only closed merge requests can be reopened');
    const [s, t] = await Promise.all([Branch.exists({ _id: mr.sourceBranch }), Branch.exists({ _id: mr.targetBranch })]);
    if (!s || !t) throw badRequest('A branch of this merge request no longer exists');
    mr.status = MR_STATUS.OPEN;
    mr.closedAt = undefined;
  }
  await mr.save();
  await recordActivity(doc._id, user.id, action === 'close' ? ACTIVITY.MR_CLOSED : ACTIVITY.MR_REOPENED, { number: mr.number });
  return mr;
}

/* ------------------------------- Comments ------------------------------- */

export async function listComments(doc, number) {
  const mr = await getMr(doc, number);
  const source = await Branch.findById(mr.sourceBranch).select('head').lean();
  const comments = await Comment.find({ mergeRequest: mr._id }).sort({ createdAt: 1 }).populate('author', PUBLIC_USER_FIELDS).lean();
  return comments.map((c) => ({
    ...c,
    // Line comments written on an older version of the branch may point at the wrong line now.
    outdated: Boolean(c.anchor?.commit && source && String(c.anchor.commit) !== String(source.head)),
  }));
}

export async function addComment(doc, number, user, { body, anchor, parent }) {
  const mr = await getMr(doc, number);
  if (!can(doc, user.id, 'comment')) throw forbidden('You need reviewer access to comment');
  let anchorDoc;
  if (anchor) {
    const source = await Branch.findById(mr.sourceBranch).select('head').lean();
    anchorDoc = { ...anchor, commit: source?.head };
  }
  if (parent) {
    const p = await Comment.findOne({ _id: parent, mergeRequest: mr._id }).select('_id').lean();
    if (!p) throw notFound('Parent comment');
  }
  const comment = await Comment.create({ document: doc._id, mergeRequest: mr._id, author: user.id, body, anchor: anchorDoc, parent });
  await MergeRequest.updateOne({ _id: mr._id }, { $set: { updatedAt: new Date() } });
  await recordActivity(doc._id, user.id, ACTIVITY.COMMENT, { number: mr.number });
  await notify([mr.author], { type: NOTIFICATION.MR_COMMENT, title: `${user.name} commented on !${mr.number}`, body: body.slice(0, 140), link: mrLink(doc, mr.number) }, { except: user.id });
  return Comment.findById(comment._id).populate('author', PUBLIC_USER_FIELDS).lean();
}

export async function setCommentResolved(doc, commentId, user, resolved) {
  if (!can(doc, user.id, 'comment')) throw forbidden();
  const c = await Comment.findOneAndUpdate({ _id: commentId, document: doc._id }, { $set: { resolved, resolvedBy: resolved ? user.id : null } }, { new: true });
  if (!c) throw notFound('Comment');
  return c;
}

export async function deleteComment(doc, commentId, user) {
  const c = await Comment.findOne({ _id: commentId, document: doc._id });
  if (!c) throw notFound('Comment');
  if (String(c.author) !== user.id && !can(doc, user.id, 'manage')) throw forbidden('You can only delete your own comments');
  await Comment.deleteMany({ $or: [{ _id: c._id }, { parent: c._id }] });
}
