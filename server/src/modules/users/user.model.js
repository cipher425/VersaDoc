import mongoose from 'mongoose';
import { USER_STATUS } from '../../config/constants.js';

const COLORS = ['#6366f1', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#ec4899', '#8b5cf6', '#14b8a6'];

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true, select: false },
    bio: { type: String, trim: true, maxlength: 200 },
    avatarColor: { type: String, default: () => COLORS[Math.floor(Math.random() * COLORS.length)] },
    status: { type: String, enum: Object.values(USER_STATUS), default: USER_STATUS.ACTIVE },
  },
  { timestamps: true }
);

userSchema.set('toJSON', {
  transform: (_doc, ret) => {
    delete ret.passwordHash;
    delete ret.__v;
    return ret;
  },
});

export const User = mongoose.model('User', userSchema);

/** Fields that are safe to show other users. */
export const PUBLIC_USER_FIELDS = 'name email avatarColor';
