import mongoose from 'mongoose';
import { Document } from './document.model.js';
import { PERMISSIONS, ROLE_RANK, VISIBILITY } from '../../config/constants.js';
import { forbidden, notFound } from '../../utils/AppError.js';

const idOf = (x) => String(x?._id ?? x);

export function roleOf(doc, userId) {
  if (!userId) return null;
  if (idOf(doc.owner) === String(userId)) return 'owner';
  const c = doc.collaborators?.find((col) => idOf(col.user) === String(userId));
  return c?.role ?? null;
}

/** Can this user perform `action` (see PERMISSIONS) on this document? */
export function can(doc, userId, action) {
  const needed = PERMISSIONS[action];
  let role = roleOf(doc, userId);
  if (!role && doc.visibility === VISIBILITY.PUBLIC) role = 'viewer';
  return Boolean(role) && ROLE_RANK[role] >= ROLE_RANK[needed];
}

/**
 * Loads a document and enforces a permission, all on the server.
 * A private document you have no role on answers 404 (not 403) so its existence isn't leaked.
 */
export async function loadDocument(docId, user, action) {
  if (!mongoose.isValidObjectId(docId)) throw notFound('Document');
  const doc = await Document.findById(docId);
  if (!doc) throw notFound('Document');
  const role = roleOf(doc, user?.id);
  if (!role && doc.visibility !== VISIBILITY.PUBLIC) throw notFound('Document');
  if (!can(doc, user?.id, action)) throw forbidden(`You need ${PERMISSIONS[action]} access to do this`);
  return { doc, role: role || 'viewer' };
}

/** Express middleware: loads req.doc / req.role for routes under /documents/:docId. */
export const withDocument = (action) => async (req, _res, next) => {
  const { doc, role } = await loadDocument(req.params.docId, req.user, action);
  req.doc = doc;
  req.role = role;
  next();
};
