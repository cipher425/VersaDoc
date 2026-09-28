import { useEffect, useState } from 'react';
import { Link, useNavigate, useOutletContext, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { GitMerge, GitPullRequest, GitPullRequestClosed, MessageSquare, ArrowRight } from 'lucide-react';
import { http } from '../../lib/api';
import { docKeys, useBranches } from '../documents/api';
import { useAuth } from '../auth/AuthContext';
import { DiffViewer } from '../diff/DiffViewer';
import { Button } from '../../components/ui/Button';
import { Field, Input, Select, Textarea } from '../../components/ui/Form';
import { EmptyState, ErrorState, Skeleton } from '../../components/ui/Feedback';
import { Tabs } from '../../components/ui/Layout';
import { Avatar, AvatarStack } from '../../components/ui/Avatar';
import { fromNow } from '../../lib/format';

const ICON = { OPEN: [GitPullRequest, 'text-emerald-600'], MERGED: [GitMerge, 'text-violet-600'], CLOSED: [GitPullRequestClosed, 'text-red-600'] };

export function MergeRequestsPage() {
  const { doc, can } = useOutletContext();
  const [status, setStatus] = useState('OPEN');
  const { data, isLoading, error } = useQuery({
    queryKey: docKeys.mrs(doc._id, status),
    queryFn: () => http.get(`/documents/${doc._id}/merge-requests`, { status }).then((r) => r.data),
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Tabs tabs={[{ value: 'OPEN', label: 'Open' }, { value: 'MERGED', label: 'Merged' }, { value: 'CLOSED', label: 'Closed' }]} value={status} onChange={setStatus} />
        {can('edit') && <Button size="sm" to={`/d/${doc._id}/merge-requests/new`}><GitPullRequest className="h-4 w-4" /> New merge request</Button>}
      </div>
      {isLoading ? (
        <Skeleton className="h-64" />
      ) : error ? (
        <ErrorState error={error} />
      ) : !data.length ? (
        <EmptyState icon={GitPullRequest} title={`No ${status.toLowerCase()} merge requests`} message="A merge request asks teammates to review a branch before it's merged." />
      ) : (
        <ul className="card divide-y divide-slate-100">
          {data.map((mr) => {
            const [Icon, color] = ICON[mr.status];
            return (
              <li key={mr._id}>
                <Link to={`/d/${doc._id}/merge-requests/${mr.number}`} className="flex items-start gap-3 p-4 hover:bg-slate-50">
                  <Icon className={`mt-0.5 h-5 w-5 ${color}`} />
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-slate-900">{mr.title}</p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      !{mr.number} opened {fromNow(mr.createdAt)} by {mr.author?.name} · <code>{mr.sourceBranchName}</code> → <code>{mr.targetBranchName}</code>
                    </p>
                  </div>
                  <AvatarStack users={mr.reviewers.map((r) => r.user).filter(Boolean)} max={3} />
                  {mr.commentCount > 0 && <span className="flex items-center gap-1 text-xs text-slate-500"><MessageSquare className="h-4 w-4" /> {mr.commentCount}</span>}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export function NewMergeRequestPage() {
  const { doc } = useOutletContext();
  const { user } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [params] = useSearchParams();
  const branches = useBranches(doc._id);
  const [source, setSource] = useState(params.get('source') || '');
  const [target, setTarget] = useState(doc.defaultBranch?._id || '');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [reviewers, setReviewers] = useState([]);
  const [busy, setBusy] = useState(false);

  const src = branches.data?.find((b) => b._id === source);
  const tgt = branches.data?.find((b) => b._id === target);
  useEffect(() => {
    if (src && !title) setTitle(src.head?.message || src.name.replace(/[-_/]/g, ' '));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src?._id]);

  const preview = useQuery({
    queryKey: ['compare', doc._id, tgt?.name, src?.name],
    queryFn: () => http.get(`/documents/${doc._id}/compare`, { from: tgt.name, to: src.name }).then((r) => r.data),
    enabled: Boolean(src && tgt && src._id !== tgt._id),
  });

  const people = [doc.owner, ...doc.collaborators.filter((c) => c.role !== 'viewer').map((c) => c.user)].filter((u) => u && u._id !== user._id);

  const submit = async () => {
    setBusy(true);
    try {
      const { data } = await http.post(`/documents/${doc._id}/merge-requests`, { title, description, sourceBranchId: source, targetBranchId: target, reviewers });
      toast.success(`Merge request !${data.number} opened`);
      qc.invalidateQueries({ queryKey: ['mrs', doc._id] });
      qc.invalidateQueries({ queryKey: docKeys.detail(doc._id) });
      navigate(`/d/${doc._id}/merge-requests/${data.number}`);
    } catch (err) {
      if (err.code === 'MR_EXISTS') navigate(`/d/${doc._id}/merge-requests/${err.details.number}`);
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  if (branches.isLoading) return <Skeleton className="h-64" />;

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-bold text-slate-900">Open a merge request</h2>
      <div className="card flex flex-col gap-3 p-4 sm:flex-row sm:items-end">
        <Field label="Merge changes from" className="flex-1">
          <Select value={source} onChange={(e) => setSource(e.target.value)}>
            <option value="">Choose a branch…</option>
            {branches.data.filter((b) => !b.isDefault).map((b) => <option key={b._id} value={b._id}>{b.name} ({b.ahead} ahead)</option>)}
          </Select>
        </Field>
        <ArrowRight className="mx-auto mb-3 hidden h-5 w-5 text-slate-400 sm:block" />
        <Field label="Into" className="flex-1">
          <Select value={target} onChange={(e) => setTarget(e.target.value)}>
            {branches.data.map((b) => <option key={b._id} value={b._id}>{b.name}</option>)}
          </Select>
        </Field>
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="card space-y-4 p-5 lg:col-span-2">
          <Field label="Title"><Input value={title} onChange={(e) => setTitle(e.target.value)} /></Field>
          <Field label="Description" hint="What changed and why? What should reviewers look at?"><Textarea rows={5} value={description} onChange={(e) => setDescription(e.target.value)} /></Field>
        </div>
        <div className="card p-5">
          <p className="mb-2 text-sm font-semibold text-slate-900">Reviewers</p>
          {people.length ? (
            <div className="space-y-2">
              {people.map((p) => (
                <label key={p._id} className="flex cursor-pointer items-center gap-2 text-sm">
                  <input type="checkbox" className="accent-brand-600" checked={reviewers.includes(p._id)} onChange={(e) => setReviewers((r) => (e.target.checked ? [...r, p._id] : r.filter((x) => x !== p._id)))} />
                  <Avatar user={p} size="xs" /> {p.name}
                </label>
              ))}
            </div>
          ) : (
            <p className="text-sm text-slate-500">Invite collaborators (Settings) to request reviews.</p>
          )}
          {doc.settings?.requiredApprovals > 0 && <p className="mt-3 text-xs text-amber-700">This document needs {doc.settings.requiredApprovals} approval(s) before merging.</p>}
        </div>
      </div>
      <div className="flex justify-end">
        <Button loading={busy} disabled={!source || !target || source === target || title.trim().length < 3} onClick={submit}>
          <GitPullRequest className="h-4 w-4" /> Open merge request
        </Button>
      </div>
      {preview.data && (
        <div>
          <p className="mb-2 text-sm font-medium text-slate-700">Preview of changes</p>
          <DiffViewer diff={preview.data.diff} />
        </div>
      )}
    </div>
  );
}
