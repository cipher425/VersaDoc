import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';

dayjs.extend(relativeTime);

export const fromNow = (d) => dayjs(d).fromNow();
export const formatDate = (d) => dayjs(d).format('D MMM YYYY');
export const formatDateTime = (d) => dayjs(d).format('D MMM YYYY, h:mm A');
export const shortHash = (h) => (h ? h.slice(0, 7) : '');
export const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** Mirrors the server's role ranking - UI hints only, the server enforces everything. */
const RANK = { owner: 4, editor: 3, reviewer: 2, viewer: 1 };
const NEEDS = { read: 'viewer', comment: 'reviewer', review: 'reviewer', edit: 'editor', merge: 'editor', manage: 'owner' };
export const roleCan = (role, action) => (RANK[role] || 0) >= RANK[NEEDS[action]];
