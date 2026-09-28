import mongoose from 'mongoose';
import { Commit, COMMIT_META } from './commit.model.js';
import { Branch } from './branch.model.js';
import { getLines } from './storage.service.js';
import { ancestors } from '../../lib/diff/graph.js';
import { applyDelta } from '../../lib/diff/delta.js';
import { diffSequences } from '../../lib/diff/myers.js';
import { splitLines } from '../../lib/diff/text.js';
import { env } from '../../config/env.js';
import { PUBLIC_USER_FIELDS } from '../users/user.model.js';
import { LRU } from '../../infra/lru.js';
import { badRequest, notFound } from '../../utils/AppError.js';

/** The whole commit graph of one document, in memory: Map<id, { parents, generation }>. */
export async function loadGraph(documentId) {
  const rows = await Commit.find({ document: documentId }).select('parents generation').lean();
  return new Map(rows.map((c) => [String(c._id), { parents: c.parents.map(String), generation: c.generation }]));
}

/**
 * Accepts what a user might type: a branch name, a full commit id, or a short hash (7+ chars).
 * Returns the commit id.
 */
export async function resolveRef(documentId, ref) {
  if (!ref) throw badRequest('Missing reference');
  const branch = await Branch.findOne({ document: documentId, name: ref }).select('head').lean();
  if (branch) return String(branch.head);
  if (mongoose.isValidObjectId(ref)) {
    const c = await Commit.findOne({ _id: ref, document: documentId }).select('_id').lean();
    if (c) return String(c._id);
  }
  if (/^[0-9a-f]{7,40}$/i.test(ref)) {
    const matches = await Commit.find({ document: documentId, hash: { $regex: `^${ref.toLowerCase()}` } }).select('_id').limit(2).lean();
    if (matches.length === 1) return String(matches[0]._id);
    if (matches.length > 1) throw badRequest(`Short hash "${ref}" is ambiguous`);
  }
  throw notFound(`Branch or commit "${ref}"`);
}

export async function commitMeta(ids) {
  const commits = await Commit.find({ _id: { $in: ids } })
    .select(COMMIT_META)
    .populate('author', PUBLIC_USER_FIELDS)
    .lean();
  const byId = new Map(commits.map((c) => [String(c._id), c]));
  return ids.map((id) => byId.get(String(id))).filter(Boolean);
}

/** History of a branch: every commit reachable from its head, newest first. */
export async function branchLog(documentId, headId, { page = 1, limit = 30 } = {}) {
  const graph = await loadGraph(documentId);
  const ids = [...ancestors(graph, String(headId))];
  const metas = await Commit.find({ _id: { $in: ids } }).select('_id generation createdAt').lean();
  metas.sort((a, b) => b.generation - a.generation || b.createdAt - a.createdAt);
  const pageIds = metas.slice((page - 1) * limit, page * limit).map((m) => m._id);
  return { items: await commitMeta(pageIds), total: metas.length };
}

const blameCache = new LRU(Math.max(20, env.CONTENT_CACHE_SIZE / 10));
const BLAME_MAX_COMMITS = 400;

/**
 * Blame: for every line of the current version, which commit last changed it.
 *
 * Walk the first-parent chain from oldest to newest, keeping an array "origin[i] = commit that
 * wrote line i". For each commit, apply its change: lines it inserted get its id, unchanged
 * lines keep their old origin. Deltas already describe exactly which lines changed, so most
 * steps cost almost nothing. (Lines brought in by a merge are credited to the merge commit.)
 */
export async function blame(documentId, headId) {
  const key = String(headId);
  const hit = blameCache.get(key);
  if (hit) return hit;

  const chain = [];
  let current = await Commit.findById(headId).select('parents storage snapshot delta').lean();
  while (current && chain.length < BLAME_MAX_COMMITS) {
    chain.push(current);
    if (!current.parents.length) break;
    current = await Commit.findById(current.parents[0]).select('parents storage snapshot delta').lean();
  }
  chain.reverse();
  const truncated = chain[0].parents.length > 0;

  let lines = truncated ? await getLines(chain[0]._id) : splitLines(chain[0].snapshot);
  let origin = lines.map(() => String(chain[0]._id));

  for (let i = 1; i < chain.length; i++) {
    const c = chain[i];
    let newLines;
    let regions;
    if (c.storage === 'delta') {
      newLines = applyDelta(lines, c.delta);
      // Rebuild region coordinates in the new version from the delta.
      regions = [];
      let shift = 0;
      for (const [aStart, aEnd, inserted] of c.delta) {
        regions.push({ aStart, aEnd, bStart: aStart + shift, bEnd: aStart + shift + inserted.length });
        shift += inserted.length - (aEnd - aStart);
      }
    } else {
      newLines = splitLines(c.snapshot);
      regions = diffSequences(lines, newLines, { maxEdits: env.MAX_DIFF_EDITS }).regions;
    }
    const nextOrigin = [];
    let ai = 0;
    for (const r of regions) {
      while (ai < r.aStart) nextOrigin.push(origin[ai++]);
      for (let b = r.bStart; b < r.bEnd; b++) nextOrigin.push(String(c._id));
      ai = r.aEnd;
    }
    while (ai < origin.length) nextOrigin.push(origin[ai++]);
    lines = newLines;
    origin = nextOrigin;
  }

  // Group consecutive lines from the same commit into blocks.
  const blocks = [];
  lines.forEach((text, i) => {
    const last = blocks[blocks.length - 1];
    if (last && last.commitId === origin[i]) last.lines.push(text);
    else blocks.push({ commitId: origin[i], startLine: i + 1, lines: [text] });
  });
  const commits = await commitMeta([...new Set(origin)]);
  const result = { blocks, commits, truncated };
  blameCache.set(key, result);
  return result;
}
