import mongoose from 'mongoose';

/** A branch is just a movable pointer to a commit ("head") - exactly like Git. */
const branchSchema = new mongoose.Schema(
  {
    document: { type: mongoose.Schema.Types.ObjectId, ref: 'Document', required: true },
    name: { type: String, required: true, trim: true },
    head: { type: mongoose.Schema.Types.ObjectId, ref: 'Commit', required: true },
    createdFrom: { type: mongoose.Schema.Types.ObjectId, ref: 'Commit' },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    isDefault: { type: Boolean, default: false },
  },
  { timestamps: true }
);

branchSchema.index({ document: 1, name: 1 }, { unique: true });

export const Branch = mongoose.model('Branch', branchSchema);
