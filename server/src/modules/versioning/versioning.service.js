import mongoose from 'mongoose';
import { Branch } from './branch.model.js';
import { Commit, COMMIT_META } from './commit.model.js';
import { Draft } from './draft.model.js';
import { createCommit, getContent, getLines } from './storage.service.js';
import { commitMeta, loadGraph, resolveRef } from './history.service.js';
import { can } from '../documents/access.js';
import { Document } from '../documents/document.model.js';
import { MergeRequest } from '../reviews/mergeRequest.model.js';
import { recordActivity } from '../activity/activity.service.js';
import { runDiffTask } from '../../lib/diff/pool.js';
import { countAhead } from '../../lib/diff/graph.js';
import { CONFLICT_MARKER_RE, withConflictMarkers } from '../../lib/diff/merge3.js';
import { byteSize, hashText, joinLines, normalize, splitLines } from '../../lib/diff/text.js';
import { ACTIVITY, BRANCH_NAME_RE, MR_STATUS } from '../../config/constants.js';
import { env } from '../../config/env.js';
import { PUBLIC_USER_FIELDS } from '../users/user.model.js';
import { AppError, badRequest, conflict, forbidden, notFound } from '../../utils/AppError.js';

const diffOpts = () => ({ maxEdits: env.MAX_DIFF_EDITS });

export async function getBranch(doc, branchId) {
  if (!mongoose.isValidObjectId(branchId)) throw notFound('Branch');
  const branch = await Branch.findOne({ _id: branchId, document: doc._id });
  if (!branch) throw notFound('Branch');
  return branch;
}

export const isProtected = (doc, branch) => branch.isDefault && doc.settings.protectDefaultBranch;

/** Protected branches only change through merge requests (the owner may still commit directly). */
function assertCanCommit(doc, branch, user) {
  if (!can(doc, user.id, 'edit')) throw forbidden('You need editor access to change this document');
  if (isProtected(doc, branch) && !can(doc, user.id, 'commitProtected')) {
    throw new AppError(403, 'PROTECTED_BRANCH', `"${branch.name}" is protected. Create a branch and open a merge request instead.`);
  }
}

/* ------------------------------- Branches ------------------------------- */

export async function listBranches(doc) {
  const [branches, graph] = await Promise.all([Branch.find({ document: doc._id }).populate('createdBy', PUBLIC_USER_FIELDS).lean(), loadGraph(doc._id)]);
  const heads = await commitMeta(branches.map((b) => b.head));
  const headById = new Map(heads.map((h) => [String(h._id), h]));
  const def = branches.find((b) => b.isDefault);
  const openMrs = await MergeRequest.find({ document: doc._id, status: MR_STATUS.OPEN }).select('number sourceBranch').lean();
  return branches
    .map((b) => ({
      ...b,
      head: headById.get(String(b.head)),
      protected: isProtected(doc, b),
      // "3 ahead, 1 behind main" - computed from the commit graph.
      ahead: def && !b.isDefault ? countAhead(graph, String(b.head), String(def.head)) : 0,
      behind: def && !b.isDefault ? countAhead(graph, String(def.head), String(b.head)) : 0,
      openMergeRequest: openMrs.find((m) => String(m.sourceBranch) === String(b._id))?.number ?? null,
    }))
    .sort((a, b) => (b.isDefault - a.isDefault) || new Date(b.head?.createdAt) - new Date(a.head?.createdAt));
}

export async function createBranch(doc, user, { name, from }) {
  if (!BRANCH_NAME_RE.test(name)) throw badRequest('Branch names use letters, numbers, - _ . / (max 50 characters)');
  const fromCommit = await resolveRef(doc._id, from);
  try {
    const branch = await Branch.create({ document: doc._id, name, head: fromCommit, createdFrom: fromCommit, createdBy: user.id });
    await recordActivity(doc._id, user.id, ACTIVITY.BRANCH_CREATED, { branch: name });
    return branch;
  } catch (err) {
    if (err.code === 11000) throw conflict(`A branch named "${name}" already exists`);
    throw err;
  }
}

export async function deleteBranch(doc, user, branchId) {
  const branch = await getBranch(doc, branchId);
  if (branch.isDefault) throw badRequest('The default branch cannot be deleted');
  if (String(branch.createdBy) !== user.id && !can(doc, user.id, 'manage')) throw forbidden('Only the branch creator or the owner can delete it');
  await MergeRequest.updateMany(
    { document: doc._id, status: MR_STATUS.OPEN, $or: [{ sourceBranch: branch._id }, { targetBranch: branch._id }] },
    { $set: { status: MR_STATUS.CLOSED, closedAt: new Date() } }
  );
  await Draft.deleteMany({ branch: branch._id });
  await branch.deleteOne();
  await recordActivity(doc._id, user.id, ACTIVITY.BRANCH_DELETED, { branch: branch.name });
}

export async function branchContent(doc, branchId) {
  const branch = await getBranch(doc, branchId);
  const [head] = await commitMeta([branch.head]);
  return { branch: { ...branch.toObject(), protected: isProtected(doc, branch) }, head, content: await getContent(branch.head) };
}

/* -------------------------------- Drafts -------------------------------- */

/** The editor's starting point: my draft if I have one, otherwise the branch head. */
export async function getDraft(doc, branchId, user) {
  const branch = await getBranch(doc, branchId);
  const draft = await Draft.findOne({ branch: branch._id, user: user.id }).lean();
  const [head] = await commitMeta([branch.head]);
  const headContent = await getContent(branch.head);
  return {
    branch: { ...branch.toObject(), protected: isProtected(doc, branch) },
    head,
    draft,
    content: draft ? draft.content : headContent,
    baseCommit: draft ? draft.baseCommit : branch.head,
    // Someone committed to this branch after I started editing.
    stale: Boolean(draft && String(draft.baseCommit) !== String(branch.head)),
    dirty: Boolean(draft && hashText(draft.content) !== hashText(headContent)),
  };
}

export async function saveDraft(doc, branchId, user, { content, baseCommit }) {
  const branch = await getBranch(doc, branchId);
  if (!can(doc, user.id, 'edit')) throw forbidden('You need editor access to edit');
  const text = normalize(content);
  if (byteSize(text) > env.MAX_DOCUMENT_BYTES) throw badRequest(`Documents are limited to ${Math.round(env.MAX_DOCUMENT_BYTES / 1024)} KB`);
  const base = await Commit.findOne({ _id: baseCommit, document: doc._id }).select('_id contentHash').lean();
  if (!base) throw badRequest('Unknown base version');

  // Back to exactly the base version -> nothing to keep.
  if (String(base._id) === String(branch.head) && hashText(text) === base.contentHash) {
    await Draft.deleteOne({ branch: branch._id, user: user.id });
    return { saved: true, dirty: false, savedAt: new Date() };
  }
  const draft = await Draft.findOneAndUpdate(
    { branch: branch._id, user: user.id },
    { $set: { content: text, baseCommit: base._id, document: doc._id } },
    { upsert: true, new: true }
  );
  return { saved: true, dirty: true, savedAt: draft.updatedAt, stale: String(draft.baseCommit) !== String(branch.head) };
}

/** "What am I about to commit?" - my draft compared with the version it started from. */
export async function draftDiff(doc, branchId, user) {
  const branch = await getBranch(doc, branchId);
  const draft = await Draft.findOne({ branch: branch._id, user: user.id }).lean();
  if (!draft) return { stats: { additions: 0, deletions: 0 }, hunks: [], truncated: false };
  const base = await getLines(draft.baseCommit);
  const mine = splitLines(draft.content);
  return runDiffTask('diffView', [base, mine, diffOpts()], Math.max(base.length, mine.length));
}

export async function discardDraft(doc, branchId, user) {
  const branch = await getBranch(doc, branchId);
  await Draft.deleteOne({ branch: branch._id, user: user.id });
}

/**
 * The branch moved while I was editing. Bring my draft up to date with a three-way merge:
 * base = the version I started from, ours = my draft, theirs = the new head.
 * Clean -> draft updated automatically. Conflicts -> returned for the resolver UI, and the
 * client sends back `resolvedContent`.
 */
export async function rebaseDraft(doc, branchId, user, { resolvedContent } = {}) {
  const branch = await getBranch(doc, branchId);
  const draft = await Draft.findOne({ branch: branch._id, user: user.id });
  if (!draft) throw notFound('Draft');
  if (String(draft.baseCommit) === String(branch.head)) return { status: 'UP_TO_DATE', content: draft.content };

  if (resolvedContent !== undefined) {
    if (CONFLICT_MARKER_RE.test(resolvedContent)) throw badRequest('Resolve all conflict markers (<<<<<<< ======= >>>>>>>) first', undefined, 'UNRESOLVED_CONFLICTS');
    draft.content = normalize(resolvedContent);
    draft.baseCommit = branch.head;
    await draft.save();
    return { status: 'REBASED', content: draft.content, baseCommit: draft.baseCommit };
  }

  const [base, head] = await Promise.all([getLines(draft.baseCommit), getLines(branch.head)]);
  const ours = splitLines(draft.content);
  const result = await runDiffTask('merge3', [base, ours, head, diffOpts()], Math.max(base.length, ours.length, head.length));
  if (result.clean) {
    draft.content = joinLines(result.lines);
    draft.baseCommit = branch.head;
    await draft.save();
    return { status: 'REBASED', content: draft.content, baseCommit: draft.baseCommit };
  }
  return {
    status: 'CONFLICTS',
    conflictCount: result.conflictCount,
    chunks: result.chunks,
    labels: { ours: 'Your draft', theirs: `Latest "${branch.name}"` },
    withMarkers: withConflictMarkers(result.chunks, 'your draft', branch.name),
    headCommit: branch.head,
  };
}

/* -------------------------------- Commits ------------------------------- */

async function moveBranchHead(branch, expectedHead, newHead, orphanCommitId) {
  // Optimistic concurrency: only move the branch if nobody else moved it first.
  const moved = await Branch.findOneAndUpdate({ _id: branch._id, head: expectedHead }, { $set: { head: newHead } }, { new: true });
  if (!moved) {
    if (orphanCommitId) await Commit.deleteOne({ _id: orphanCommitId });
    throw conflict('Someone else updated this branch a moment ago. Update your draft and try again.', undefined, 'BRANCH_MOVED');
  }
  return moved;
}

async function afterCommit(doc, commit) {
  await Document.updateOne(
    { _id: doc._id },
    { $inc: { 'stats.commits': 1 }, $set: { 'stats.words': commit.stats.words, 'stats.lines': commit.stats.lines, lastActivityAt: new Date() } }
  );
}

export async function commitDraft(doc, branchId, user, { message }) {
  const branch = await getBranch(doc, branchId);
  assertCanCommit(doc, branch, user);
  const draft = await Draft.findOne({ branch: branch._id, user: user.id });
  if (!draft) throw badRequest('There are no changes to commit', undefined, 'NOTHING_TO_COMMIT');
  if (String(draft.baseCommit) !== String(branch.head)) {
    throw conflict('This branch has new commits since you started editing. Update your draft first.', { head: branch.head }, 'BRANCH_MOVED');
  }
  const head = await Commit.findById(branch.head).select('contentHash').lean();
  if (hashText(draft.content) === head.contentHash) {
    await draft.deleteOne();
    throw badRequest('Your draft is identical to the latest version', undefined, 'NOTHING_TO_COMMIT');
  }

  const commit = await createCommit({
    documentId: doc._id,
    parents: [branch.head],
    author: user.id,
    message,
    lines: splitLines(draft.content),
    branchName: branch.name,
  });
  await moveBranchHead(branch, draft.baseCommit, commit._id, commit._id);
  await draft.deleteOne();
  if (branch.isDefault) await afterCommit(doc, commit);
  else await Document.updateOne({ _id: doc._id }, { $inc: { 'stats.commits': 1 }, $set: { lastActivityAt: new Date() } });
  await recordActivity(doc._id, user.id, ACTIVITY.COMMIT, { branch: branch.name, hash: commit.hash, message, additions: commit.stats.additions, deletions: commit.stats.deletions });
  return (await commitMeta([commit._id]))[0];
}

/** "Restore this version": a NEW commit whose content equals an old one. History is never rewritten. */
export async function restoreVersion(doc, branchId, user, { commitId }) {
  const branch = await getBranch(doc, branchId);
  assertCanCommit(doc, branch, user);
  const target = await Commit.findOne({ _id: commitId, document: doc._id }).select('hash contentHash').lean();
  if (!target) throw notFound('Commit');
  const head = await Commit.findById(branch.head).select('contentHash').lean();
  if (head.contentHash === target.contentHash) throw badRequest('The branch already has this content', undefined, 'NOTHING_TO_COMMIT');

  const expectedHead = branch.head;
  const commit = await createCommit({
    documentId: doc._id,
    parents: [expectedHead],
    author: user.id,
    message: `Restore version ${target.hash.slice(0, 7)}`,
    lines: await getLines(target._id),
    kind: 'revert',
    branchName: branch.name,
  });
  await moveBranchHead(branch, expectedHead, commit._id, commit._id);
  await Draft.deleteMany({ branch: branch._id, user: user.id });
  if (branch.isDefault) await afterCommit(doc, commit);
  await recordActivity(doc._id, user.id, ACTIVITY.REVERT, { branch: branch.name, restored: target.hash });
  return (await commitMeta([commit._id]))[0];
}

/** One commit and what it changed compared to its first parent. */
export async function commitDetails(doc, commitId) {
  if (!mongoose.isValidObjectId(commitId)) throw notFound('Commit');
  const commit = await Commit.findOne({ _id: commitId, document: doc._id }).select(COMMIT_META).populate('author', PUBLIC_USER_FIELDS).lean();
  if (!commit) throw notFound('Commit');
  const newLines = await getLines(commit._id);
  const oldLines = commit.parents.length ? await getLines(commit.parents[0]) : [];
  const diff = await runDiffTask('diffView', [oldLines, newLines, diffOpts()], Math.max(oldLines.length, newLines.length));
  const parents = await commitMeta(commit.parents);
  return { commit, parents, diff };
}

export async function compare(doc, fromRef, toRef) {
  const [fromId, toId] = await Promise.all([resolveRef(doc._id, fromRef), resolveRef(doc._id, toRef)]);
  const [from, to] = await commitMeta([fromId, toId]);
  const [a, b] = await Promise.all([getLines(fromId), getLines(toId)]);
  const diff = await runDiffTask('diffView', [a, b, diffOpts()], Math.max(a.length, b.length));
  return { from, to, diff };
}

export const commitContent = async (doc, commitId) => {
  const c = await Commit.findOne({ _id: commitId, document: doc._id }).select('hash').lean();
  if (!c) throw notFound('Commit');
  return { hash: c.hash, content: await getContent(c._id) };
};
