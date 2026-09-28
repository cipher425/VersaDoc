import mongoose from 'mongoose';
import { MR_STATUS, REVIEW_STATE } from '../../config/constants.js';

const reviewerSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    state: { type: String, enum: Object.values(REVIEW_STATE), default: REVIEW_STATE.PENDING },
    // The source head the reviewer looked at. If new commits arrive, the approval is "stale".
    reviewedHead: { type: mongoose.Schema.Types.ObjectId, ref: 'Commit' },
    reviewedAt: Date,
  },
  { _id: false }
);

/** A request to merge one branch into another, with review - Git's "pull request". */
const mergeRequestSchema = new mongoose.Schema(
  {
    document: { type: mongoose.Schema.Types.ObjectId, ref: 'Document', required: true },
    number: { type: Number, required: true },
    title: { type: String, required: true, trim: true, maxlength: 150 },
    description: { type: String, trim: true, maxlength: 5000 },
    author: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    sourceBranch: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch' },
    targetBranch: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch' },
    sourceBranchName: String,
    targetBranchName: String,
    status: { type: String, enum: Object.values(MR_STATUS), default: MR_STATUS.OPEN },
    reviewers: [reviewerSchema],
    mergedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    mergedAt: Date,
    mergeCommit: { type: mongoose.Schema.Types.ObjectId, ref: 'Commit' },
    fastForward: Boolean,
    closedAt: Date,
  },
  { timestamps: true }
);

mergeRequestSchema.index({ document: 1, number: 1 }, { unique: true });
mergeRequestSchema.index({ document: 1, status: 1, updatedAt: -1 });
mergeRequestSchema.index({ 'reviewers.user': 1, status: 1 });
mergeRequestSchema.index({ author: 1, status: 1 });

export const MergeRequest = mongoose.model('MergeRequest', mergeRequestSchema);
