import mongoose from 'mongoose';

/**
 * An immutable snapshot of the document at one point in time.
 *
 * Storage strategy ("snapshot + delta chain", like video keyframes):
 *  - storage 'snapshot': the full text is stored in `snapshot`
 *  - storage 'delta':    only the changes against parents[0] are stored in `delta`
 * A full snapshot is forced every SNAPSHOT_INTERVAL commits (chainDepth resets to 0), so
 * rebuilding any version needs at most SNAPSHOT_INTERVAL small steps.
 * `contentHash` (SHA-256 of the full text) lets us verify every rebuilt version is exact.
 */
const commitSchema = new mongoose.Schema(
  {
    document: { type: mongoose.Schema.Types.ObjectId, ref: 'Document', required: true },
    hash: { type: String, required: true }, // 40-char id shown as a 7-char short hash
    parents: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Commit' }], // 0 = root, 2 = merge
    generation: { type: Number, required: true }, // 1 + max(parent generations)
    author: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    message: { type: String, required: true, maxlength: 500 },
    kind: { type: String, enum: ['initial', 'normal', 'merge', 'revert'], default: 'normal' },
    branchName: String, // branch it was created on (informational)
    mergeInfo: { sourceBranch: String, targetBranch: String, mergeRequestNumber: Number },

    storage: { type: String, enum: ['snapshot', 'delta'], required: true },
    snapshot: { type: String },
    delta: { type: mongoose.Schema.Types.Mixed },
    chainDepth: { type: Number, default: 0 },
    contentHash: { type: String, required: true },

    stats: {
      additions: { type: Number, default: 0 },
      deletions: { type: Number, default: 0 },
      lines: { type: Number, default: 0 },
      words: { type: Number, default: 0 },
      storedBytes: { type: Number, default: 0 },
      fullBytes: { type: Number, default: 0 },
    },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

commitSchema.index({ document: 1, hash: 1 }, { unique: true });
commitSchema.index({ document: 1, createdAt: -1 });
commitSchema.index({ document: 1, author: 1 });

/** Everything except the (possibly large) content fields. */
export const COMMIT_META = '-snapshot -delta';

export const Commit = mongoose.model('Commit', commitSchema);
