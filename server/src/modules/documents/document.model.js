import mongoose from 'mongoose';
import { DOC_ROLES, VISIBILITY } from '../../config/constants.js';

const collaboratorSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    role: { type: String, enum: [DOC_ROLES.EDITOR, DOC_ROLES.REVIEWER, DOC_ROLES.VIEWER], required: true },
    addedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

/**
 * A Document is the "repository": it owns branches, commits and merge requests.
 * Collaborators are embedded - a document has a handful of them, they are always needed for
 * permission checks, and they are never written concurrently at scale.
 */
const documentSchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    title: { type: String, required: true, trim: true, maxlength: 120 },
    slug: { type: String, required: true, unique: true },
    description: { type: String, trim: true, maxlength: 500 },
    visibility: { type: String, enum: Object.values(VISIBILITY), default: VISIBILITY.PRIVATE },
    defaultBranch: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch' },
    collaborators: [collaboratorSchema],
    settings: {
      requiredApprovals: { type: Number, min: 0, max: 5, default: 0 },
      protectDefaultBranch: { type: Boolean, default: true },
    },
    mrCounter: { type: Number, default: 0 }, // gives merge requests human numbers: !1, !2 ...
    stats: {
      commits: { type: Number, default: 0 },
      words: { type: Number, default: 0 },
      lines: { type: Number, default: 0 },
    },
    lastActivityAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

documentSchema.index({ 'collaborators.user': 1 });
documentSchema.index({ owner: 1, lastActivityAt: -1 });

export const Document = mongoose.model('Document', documentSchema);
