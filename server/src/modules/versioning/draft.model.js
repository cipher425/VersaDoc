import mongoose from 'mongoose';

/**
 * A user's unsaved work on a branch (Git's "working copy"). Autosaved while typing,
 * turned into a commit when the user clicks Commit.
 * `baseCommit` = the branch head the user started editing from. If the branch moves on
 * (a teammate committed), the draft is "stale" and must be rebased with a three-way merge.
 */
const draftSchema = new mongoose.Schema(
  {
    document: { type: mongoose.Schema.Types.ObjectId, ref: 'Document', required: true },
    branch: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', required: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    baseCommit: { type: mongoose.Schema.Types.ObjectId, ref: 'Commit', required: true },
    content: { type: String, default: '' },
  },
  { timestamps: true }
);

draftSchema.index({ branch: 1, user: 1 }, { unique: true });
draftSchema.index({ document: 1 });

export const Draft = mongoose.model('Draft', draftSchema);
