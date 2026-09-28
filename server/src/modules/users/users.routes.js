import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { User } from './user.model.js';
import { hashPassword, revokeAllSessions } from '../auth/auth.service.js';
import { password } from '../auth/auth.validators.js';
import { validate } from '../../middleware/validate.js';
import { requireAuth } from '../../middleware/auth.js';
import { ok } from '../../utils/http.js';
import { badRequest, notFound } from '../../utils/AppError.js';

const router = Router();
router.use(requireAuth);

router.patch(
  '/me',
  validate({ body: z.object({ name: z.string().trim().min(2).max(80), bio: z.string().trim().max(200) }).partial() }),
  async (req, res) => {
    const user = await User.findByIdAndUpdate(req.user.id, { $set: req.valid.body }, { new: true, runValidators: true });
    ok(res, user);
  }
);

router.patch(
  '/me/password',
  validate({ body: z.object({ currentPassword: z.string().min(1), newPassword: password }) }),
  async (req, res) => {
    const user = await User.findById(req.user.id).select('+passwordHash');
    if (!(await bcrypt.compare(req.valid.body.currentPassword, user.passwordHash))) {
      throw badRequest('Current password is incorrect', undefined, 'WRONG_PASSWORD');
    }
    user.passwordHash = await hashPassword(req.valid.body.newPassword);
    await user.save();
    await revokeAllSessions(user._id);
    ok(res, { changed: true });
  }
);

/**
 * Look up a user by EXACT email (for inviting collaborators).
 * Deliberately no partial search: you can't browse everyone's emails.
 */
router.get('/lookup', validate({ query: z.object({ email: z.string().trim().toLowerCase().email() }) }), async (req, res) => {
  const user = await User.findOne({ email: req.valid.query.email }).select('name email avatarColor').lean();
  if (!user) throw notFound('User');
  ok(res, user);
});

export default router;
