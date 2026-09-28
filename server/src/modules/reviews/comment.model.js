import mongoose from 'mongoose';

/**
 * A comment on a merge request - either general, or anchored to one line of the diff.
 * The anchor stores the commit it was written against: after new commits the comment is
 * shown as "outdated" instead of pointing at the wrong line.
 */
const commentSchema = new mongoose.Schema(
  {
    document: { type: mongoose.Schema.Types.ObjectId, ref: 'Document', required: true },
    mergeRequest: { type: mongoose.Schema.Types.ObjectId, ref: 'MergeRequest', required: true },
    author: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    body: { type: String, required: true, maxlength: 5000 },
    anchor: {
      side: { type: String, enum: ['old', 'new'] },
      line: Number,
      lineText: String,
      commit: { type: mongoose.Schema.Types.ObjectId, ref: 'Commit' },
    },
    parent: { type: mongoose.Schema.Types.ObjectId, ref: 'Comment' }, // replies form a thread
    resolved: { type: Boolean, default: false },
    resolvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    reviewState: String, // set when the comment was posted as part of a review
  },
  { timestamps: true }
);

commentSchema.index({ mergeRequest: 1, createdAt: 1 });

export const Comment = mongoose.model('Comment', commentSchema);
