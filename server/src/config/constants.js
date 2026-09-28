export const USER_STATUS = Object.freeze({ ACTIVE: 'ACTIVE', SUSPENDED: 'SUSPENDED' });

/** Roles on a document, from most to least powerful. */
export const DOC_ROLES = Object.freeze({ OWNER: 'owner', EDITOR: 'editor', REVIEWER: 'reviewer', VIEWER: 'viewer' });
export const ROLE_RANK = Object.freeze({ owner: 4, editor: 3, reviewer: 2, viewer: 1 });

/** What each action needs. Checked on the server for every request. */
export const PERMISSIONS = Object.freeze({
  read: 'viewer',
  comment: 'reviewer',
  review: 'reviewer',
  edit: 'editor', // drafts, commits on unprotected branches, branches, open merge requests
  merge: 'editor',
  commitProtected: 'owner',
  manage: 'owner', // settings, collaborators, delete
});

export const VISIBILITY = Object.freeze({ PRIVATE: 'private', PUBLIC: 'public' });

export const MR_STATUS = Object.freeze({ OPEN: 'OPEN', MERGED: 'MERGED', CLOSED: 'CLOSED' });
export const REVIEW_STATE = Object.freeze({ PENDING: 'PENDING', APPROVED: 'APPROVED', CHANGES_REQUESTED: 'CHANGES_REQUESTED' });

export const ACTIVITY = Object.freeze({
  DOC_CREATED: 'DOC_CREATED',
  COMMIT: 'COMMIT',
  REVERT: 'REVERT',
  BRANCH_CREATED: 'BRANCH_CREATED',
  BRANCH_DELETED: 'BRANCH_DELETED',
  MR_OPENED: 'MR_OPENED',
  MR_MERGED: 'MR_MERGED',
  MR_CLOSED: 'MR_CLOSED',
  MR_REOPENED: 'MR_REOPENED',
  REVIEW: 'REVIEW',
  COMMENT: 'COMMENT',
  COLLABORATOR_ADDED: 'COLLABORATOR_ADDED',
});

export const NOTIFICATION = Object.freeze({
  ADDED_TO_DOCUMENT: 'ADDED_TO_DOCUMENT',
  REVIEW_REQUESTED: 'REVIEW_REQUESTED',
  REVIEW_SUBMITTED: 'REVIEW_SUBMITTED',
  MR_MERGED: 'MR_MERGED',
  MR_COMMENT: 'MR_COMMENT',
});

export const BRANCH_NAME_RE = /^[a-z0-9][a-z0-9._/-]{0,49}$/i;
