import { useQuery } from '@tanstack/react-query';
import { http } from '../../lib/api';

export const docKeys = {
  all: ['documents'],
  detail: (id) => ['document', id],
  branches: (id) => ['branches', id],
  draft: (id, branchId) => ['draft', id, branchId],
  log: (id, ref, page) => ['log', id, ref, page],
  commit: (id, commitId) => ['commit', id, commitId],
  mrs: (id, status) => ['mrs', id, status],
  mr: (id, number) => ['mr', id, number],
  comments: (id, number) => ['mr-comments', id, number],
};

export const useDocument = (id) =>
  useQuery({ queryKey: docKeys.detail(id), queryFn: () => http.get(`/documents/${id}`).then((r) => r.data), enabled: !!id });

export const useBranches = (id) =>
  useQuery({ queryKey: docKeys.branches(id), queryFn: () => http.get(`/documents/${id}/branches`).then((r) => r.data), enabled: !!id });

/** Resolve ?branch=<id> or fall back to the default branch. */
export function pickBranch(branches, branchId, defaultBranchId) {
  if (!branches?.length) return null;
  return branches.find((b) => b._id === branchId) || branches.find((b) => b._id === defaultBranchId) || branches[0];
}
