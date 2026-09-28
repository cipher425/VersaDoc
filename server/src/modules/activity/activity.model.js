import mongoose from 'mongoose';
import { ACTIVITY, NOTIFICATION } from '../../config/constants.js';

const activitySchema = new mongoose.Schema(
  {
    document: { type: mongoose.Schema.Types.ObjectId, ref: 'Document', required: true },
    actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    type: { type: String, enum: Object.values(ACTIVITY), required: true },
    data: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);
activitySchema.index({ document: 1, createdAt: -1 });
activitySchema.index({ actor: 1, createdAt: -1 });

export const Activity = mongoose.model('Activity', activitySchema);

const notificationSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    type: { type: String, enum: Object.values(NOTIFICATION), required: true },
    title: { type: String, required: true },
    body: String,
    link: String,
    readAt: Date,
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);
notificationSchema.index({ user: 1, createdAt: -1 });
notificationSchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 120 });

export const Notification = mongoose.model('Notification', notificationSchema);
