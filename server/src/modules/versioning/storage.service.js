import crypto from 'node:crypto';
import mongoose from 'mongoose';
import { env } from '../../config/env.js';
import { Commit } from './commit.model.js';
import { LRU } from '../../infra/lru.js';
import { applyDelta, deltaSize, encodeDelta } from '../../lib/diff/delta.js';
import { diffStats } from '../../lib/diff/view.js';
import { byteSize, hashText, joinLines, splitLines, wordCount } from '../../lib/diff/text.js';
import { AppError, notFound } from '../../utils/AppError.js';

/** commitId -> lines[] of that version. Cached arrays are treated as read-only everywhere. */
const contentCache = new LRU(env.CONTENT_CACHE_SIZE);
export const cacheStats = () => contentCache.stats();

/**
 * Rebuilds the full text of any commit.
 * Walk back through parents until a snapshot (or a cached version) is found, then apply the
 * deltas forward. At most SNAPSHOT_INTERVAL steps. The result is verified against contentHash.
 */
export async function getLines(commitId, { session } = {}) {
  const cached = contentCache.get(commitId);
  if (cached) return cached;

  const chain = [];
  let lines = null;
  let current = await Commit.findById(commitId).select('parents storage snapshot delta contentHash').session(session).lean();
  if (!current) throw notFound('Commit');
  const target = current;

  for (;;) {
    const hit = contentCache.get(current._id);
    if (hit) {
      lines = hit;
      break;
    }
    if (current.storage === 'snapshot') {
      lines = splitLines(current.snapshot);
      contentCache.set(current._id, lines);
      break;
    }
    chain.push(current);
    const parentId = current.parents[0];
    current = await Commit.findById(parentId).select('parents storage snapshot delta contentHash').session(session).lean();
    if (!current) throw new AppError(500, 'BROKEN_HISTORY', `Missing parent commit ${parentId}`);
  }

  for (let i = chain.length - 1; i >= 0; i--) {
    lines = applyDelta(lines, chain[i].delta);
    contentCache.set(chain[i]._id, lines);
  }

  // Integrity check: a corrupted delta can never silently return the wrong document.
  if (hashText(joinLines(lines)) !== target.contentHash) {
    throw new AppError(500, 'INTEGRITY_ERROR', 'Stored version failed its integrity check');
  }
  return lines;
}

export const getContent = async (commitId, opts) => joinLines(await getLines(commitId, opts));

const makeHash = (parts) => crypto.createHash('sha1').update(parts.join('\u0000')).digest('hex');

/**
 * Creates a commit, choosing snapshot or delta storage automatically.
 * Delta is used when the chain isn't too long AND the delta is clearly smaller than the text.
 */
export async function createCommit({ documentId, parents = [], author, message, lines, kind = 'normal', branchName, mergeInfo, session }) {
  const text = joinLines(lines);
  const contentHash = hashText(text);
  const fullBytes = byteSize(text);
  const parentDocs = parents.length
    ? await Commit.find({ _id: { $in: parents } }).select('generation chainDepth').session(session).lean()
    : [];
  if (parentDocs.length !== parents.length) throw notFound('Parent commit');

  let storage = 'snapshot';
  let delta;
  let chainDepth = 0;
  let additions = lines.length;
  let deletions = 0;

  if (parents.length) {
    const firstParent = parentDocs.find((p) => String(p._id) === String(parents[0]));
    const parentLines = await getLines(parents[0], { session });
    const stats = diffStats(parentLines, lines, { maxEdits: env.MAX_DIFF_EDITS });
    additions = stats.additions;
    deletions = stats.deletions;
    const candidate = encodeDelta(lines, stats.regions);
    if (firstParent.chainDepth + 1 < env.SNAPSHOT_INTERVAL && deltaSize(candidate) < fullBytes * 0.6) {
      storage = 'delta';
      delta = candidate;
      chainDepth = firstParent.chainDepth + 1;
    }
  }

  const generation = parentDocs.length ? Math.max(...parentDocs.map((p) => p.generation)) + 1 : 1;
  const hash = makeHash([...parents.map(String), contentHash, message, String(author), Date.now(), Math.random()]);
  const [commit] = await Commit.create(
    [
      {
        _id: new mongoose.Types.ObjectId(),
        document: documentId,
        hash,
        parents,
        generation,
        author,
        message,
        kind,
        branchName,
        mergeInfo,
        storage,
        snapshot: storage === 'snapshot' ? text : undefined,
        delta,
        chainDepth,
        contentHash,
        stats: {
          additions,
          deletions,
          lines: lines.length,
          words: wordCount(text),
          storedBytes: storage === 'snapshot' ? fullBytes : deltaSize(delta),
          fullBytes,
        },
      },
    ],
    { session }
  );
  contentCache.set(commit._id, lines);
  return commit;
}
