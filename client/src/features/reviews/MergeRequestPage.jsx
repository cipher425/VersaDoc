import { useState } from 'react';
import { Link, useOutletContext, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { AlertTriangle, CheckCircle2, GitCommitHorizontal, GitMerge, GitPullRequest, GitPullRequestClosed, MessageSquare, XCircle, CornerDownRight, Check } from 'lucide-react';
import { http } from '../../lib/api';
import { docKeys } from '../documents/api';
import { DiffViewer } from '../diff/DiffViewer';
import { ConflictResolver } from '../diff/ConflictResolver';
import { MarkdownPreview } from '../editor/MarkdownPreview';
import { Button } from '../../components/ui/Button';
import { Dialog } from '../../components/ui/Dialog';
import { Textarea } from '../../components/ui/Form';
import { Badge, ErrorState, PageLoader, StatusBadge } from '../../components/ui/Feedback';
import { Tabs } from '../../components/ui/Layout';
import { Avatar } from '../../components/ui/Avatar';
import { fromNow, shortHash } from '../../lib/format';
import { cn } from '../../lib/cn';

const STATE_UI = {
  CLEAN: ['bg-emerald-50 text-emerald-800', CheckCircle2, 'No conflicts - ready to merge'],
  FAST_FORWARD: ['bg-emerald-50 text-emerald-800', CheckCircle2, 'Can be fast-forwarded (target has no new changes)'],
  CONFLICTS: ['bg-amber-50 text-amber-900', AlertTriangle, 'conflict(s) must be resolved'],
  UP_TO_DATE: ['bg-slate-100 text-slate-700', CheckCircle2, 'Nothing to merge'],
};

function CommentBox({ onSubmit, placeholder = 'Leave a comment', autoFocus, onCancel, compact }) {
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true);
    try {
      await onSubmit(body);
      setBody('');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="space-y-2">
      <Textarea rows={compact ? 2 : 3} autoFocus={autoFocus} placeholder={placeholder} value={body} onChange={(e) => setBody(e.target.value)} />
      <div className="flex justify-end gap-2">
        {onCancel && <Button size="sm" variant="ghost" onClick={onCancel}>Cancel</Button>}
        <Button size="sm" loading={busy} disabled={!body.trim()} onClick={submit}>Comment</Button>
      </div>
    </div>
  );
}

function Comment({ c, replies, onReply, onResolve, canComment }) {
  const [replying, setReplying] = useState(false);
  return (
    <div className={cn('rounded-xl border bg-white', c.resolved ? 'border-slate-200 opacity-70' : 'border-slate-200')}>
      <div className="flex items-start gap-3 p-3">
        <Avatar user={c.author} size="sm" />
        <div className="min-w-0 flex-1">
          <p className="text-sm">
            <b>{c.author?.name}</b> <span className="text-xs text-slate-400">{fromNow(c.createdAt)}</span>
            {c.reviewState && <StatusBadge status={c.reviewState} />}
            {c.outdated && <Badge tone="amber" className="ml-1">outdated</Badge>}
            {c.resolved && <Badge tone="green" className="ml-1">resolved</Badge>}
          </p>
          {c.anchor?.lineText && (
            <p className="mt-1 truncate rounded bg-slate-50 px-2 py-1 font-mono text-xs text-slate-600">line {c.anchor.line}: {c.anchor.lineText}</p>
          )}
          <div className="mt-1 whitespace-pre-wrap text-sm text-slate-700">{c.body}</div>
          {canComment && (
            <div className="mt-2 flex gap-3 text-xs">
              <button className="font-medium text-slate-500 hover:text-brand-600" onClick={() => setReplying((r) => !r)}>Reply</button>
              <button className="font-medium text-slate-500 hover:text-brand-600" onClick={() => onResolve(c)}>{c.resolved ? 'Unresolve' : 'Resolve'}</button>
            </div>
          )}
        </div>
      </div>
      {(replies.length > 0 || replying) && (
        <div className="space-y-2 border-t border-slate-100 bg-slate-50/60 p-3 pl-12">
          {replies.map((r) => (
            <div key={r._id} className="flex gap-2 text-sm">
              <CornerDownRight className="h-4 w-4 text-slate-300" />
              <Avatar user={r.author} size="xs" />
              <div><b>{r.author?.name}</b> <span className="text-xs text-slate-400">{fromNow(r.createdAt)}</span><p className="whitespace-pre-wrap text-slate-700">{r.body}</p></div>
            </div>
          ))}
          {replying && <CommentBox compact autoFocus placeholder="Write a reply" onCancel={() => setReplying(false)} onSubmit={async (body) => { await onReply(c, body); setReplying(false); }} />}
        </div>
      )}
    </div>
  );
}

export function MergeRequestPage() {
  const { doc } = useOutletContext();
  const { number } = useParams();
  const qc = useQueryClient();
  const [tab, setTab] = useState('conversation');
  const [composer, setComposer] = useState(null); // anchor for a new line comment
  const [conflicts, setConflicts] = useState(null);
  const [merging, setMerging] = useState(false);
  const [deleteBranch, setDeleteBranch] = useState(true);
  const [reviewing, setReviewing] = useState(null);
  const [reviewBody, setReviewBody] = useState('');

  const base = `/documents/${doc._id}/merge-requests/${number}`;
  const mrQ = useQuery({ queryKey: docKeys.mr(doc._id, number), queryFn: () => http.get(base).then((r) => r.data) });
  const commentsQ = useQuery({ queryKey: docKeys.comments(doc._id, number), queryFn: () => http.get(`${base}/comments`).then((r) => r.data) });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: docKeys.mr(doc._id, number) });
    qc.invalidateQueries({ queryKey: docKeys.comments(doc._id, number) });
    qc.invalidateQueries({ queryKey: ['mrs', doc._id] });
    qc.invalidateQueries({ queryKey: docKeys.branches(doc._id) });
    qc.invalidateQueries({ queryKey: docKeys.detail(doc._id) });
  };

  if (mrQ.isLoading) return <PageLoader />;
  if (mrQ.error) return <ErrorState error={mrQ.error} />;
  const mr = mrQ.data;
  const comments = commentsQ.data || [];
  const topLevel = comments.filter((c) => !c.parent);
  const repliesOf = (c) => comments.filter((r) => r.parent === c._id);
  const lineComments = new Map();
  for (const c of topLevel) {
    if (c.anchor?.line && !c.outdated) {
      const key = `${c.anchor.side}:${c.anchor.line}`;
      lineComments.set(key, [...(lineComments.get(key) || []), c]);
    }
  }

  const addComment = async (body, extra = {}) => {
    try {
      await http.post(`${base}/comments`, { body, ...extra });
      refresh();
    } catch (err) {
      toast.error(err.message);
      throw err;
    }
  };
  const resolveComment = async (c) => {
    await http.patch(`/documents/${doc._id}/comments/${c._id}`, { resolved: !c.resolved });
    refresh();
  };

  const merge = async (resolvedContent) => {
    setMerging(true);
    try {
      await http.post(`${base}/merge`, { deleteSourceBranch: deleteBranch, ...(resolvedContent !== undefined ? { resolvedContent, expectedTargetHead: conflicts?.targetHead } : {}) });
      toast.success(`!${mr.number} merged into ${mr.targetBranchName}`);
      setConflicts(null);
      refresh();
    } catch (err) {
      if (err.code === 'MERGE_CONFLICTS') openConflicts();
      toast.error(err.message);
    } finally {
      setMerging(false);
    }
  };

  const openConflicts = async () => {
    try {
      const { data } = await http.get(`${base}/conflicts`);
      if (data.state !== 'CONFLICTS') {
        toast.info('No conflicts anymore - you can merge directly');
        refresh();
      } else setConflicts(data);
    } catch (err) {
      toast.error(err.message);
    }
  };

  const submitReview = async () => {
    try {
      await http.post(`${base}/reviews`, { state: reviewing, body: reviewBody || undefined });
      toast.success(reviewing === 'APPROVED' ? 'Approved' : 'Changes requested');
      setReviewing(null);
      setReviewBody('');
      refresh();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const setStatus = async (action) => {
    try {
      await http.post(`${base}/${action}`);
      refresh();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const StatusIcon = { OPEN: GitPullRequest, MERGED: GitMerge, CLOSED: GitPullRequestClosed }[mr.status];
  const statusColor = { OPEN: 'bg-emerald-600', MERGED: 'bg-violet-600', CLOSED: 'bg-red-600' }[mr.status];
  const a = mr.analysis && !mr.analysis.missingBranch ? mr.analysis : null;
  const stateUi = a && STATE_UI[a.state];
  const StateIcon = stateUi?.[1];

  const renderLineExtras = (key) => {
    const list = lineComments.get(key);
    const composing = composer && `${composer.side}:${composer.line}` === key;
    if (!list && !composing) return null;
    return (
      <div className="space-y-2">
        {list?.map((c) => <Comment key={c._id} c={c} replies={repliesOf(c)} canComment={mr.permissions.canComment} onResolve={resolveComment} onReply={(p, body) => addComment(body, { parent: p._id })} />)}
        {composing && (
          <CommentBox autoFocus compact placeholder={`Comment on line ${composer.line}`} onCancel={() => setComposer(null)}
            onSubmit={async (body) => { await addComment(body, { anchor: composer }); setComposer(null); }} />
        )}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-bold text-slate-900">{mr.title} <span className="font-normal text-slate-400">!{mr.number}</span></h2>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-slate-600">
          <span className={cn('inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold text-white', statusColor)}><StatusIcon className="h-3.5 w-3.5" /> {mr.status.charAt(0) + mr.status.slice(1).toLowerCase()}</span>
          <b>{mr.author?.name}</b> wants to merge <code className="rounded bg-brand-50 px-1.5 text-brand-700">{mr.sourceBranchName}</code> into <code className="rounded bg-brand-50 px-1.5 text-brand-700">{mr.targetBranchName}</code>
          {a && <span className="text-slate-400">· {a.ahead} commit(s)</span>}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="min-w-0 space-y-4 lg:col-span-2">
          <Tabs
            tabs={[
              { value: 'conversation', label: 'Conversation', count: topLevel.length },
              { value: 'changes', label: 'Changes', count: mr.diff ? mr.diff.stats.additions + mr.diff.stats.deletions : undefined },
              { value: 'commits', label: 'Commits', count: mr.commits?.length },
            ]}
            value={tab}
            onChange={setTab}
          />
          {tab === 'conversation' && (
            <div className="space-y-3">
              <div className="rounded-xl border border-slate-200 bg-white p-4">
                <p className="mb-2 flex items-center gap-2 text-sm"><Avatar user={mr.author} size="xs" /> <b>{mr.author?.name}</b> <span className="text-xs text-slate-400">opened {fromNow(mr.createdAt)}</span></p>
                {mr.description ? <MarkdownPreview text={mr.description} /> : <p className="text-sm italic text-slate-400">No description.</p>}
              </div>
              {topLevel.map((c) => (
                <Comment key={c._id} c={c} replies={repliesOf(c)} canComment={mr.permissions.canComment} onResolve={resolveComment} onReply={(p, body) => addComment(body, { parent: p._id })} />
              ))}
              {mr.status === 'MERGED' && (
                <p className="flex items-center gap-2 rounded-xl bg-violet-50 p-3 text-sm text-violet-800">
                  <GitMerge className="h-4 w-4" /> Merged by <b>{mr.mergedBy?.name}</b> {fromNow(mr.mergedAt)}{mr.fastForward ? ' (fast-forward)' : ''}
                </p>
              )}
              {mr.permissions.canComment && <CommentBox onSubmit={(body) => addComment(body)} />}
            </div>
          )}
          {tab === 'changes' && (mr.diff ? (
            <>
              {mr.status === 'OPEN' && mr.permissions.canComment && <p className="text-xs text-slate-500">Hover a line and click the comment icon to leave a line comment.</p>}
              <DiffViewer diff={mr.diff} onLineComment={mr.status === 'OPEN' && mr.permissions.canComment ? (anchor, lineText) => setComposer({ ...anchor, lineText }) : undefined} renderLineExtras={renderLineExtras} />
            </>
          ) : <p className="text-sm text-slate-500">No diff available.</p>)}
          {tab === 'commits' && (
            <ul className="card divide-y divide-slate-100">
              {(mr.commits || []).map((c) => (
                <li key={c._id} className="flex items-center gap-3 p-3 text-sm">
                  <GitCommitHorizontal className="h-4 w-4 text-brand-600" />
                  <Link to={`/d/${doc._id}/commits/${c._id}`} className="flex-1 truncate font-medium hover:text-brand-600">{c.message}</Link>
                  <Avatar user={c.author} size="xs" />
                  <span className="font-mono text-xs text-slate-500">{shortHash(c.hash)}</span>
                </li>
              ))}
              {!mr.commits?.length && <li className="p-4 text-sm text-slate-500">Commit list is shown while the merge request is open.</li>}
            </ul>
          )}
        </div>

        <aside className="space-y-4">
          {mr.status === 'OPEN' && a && (
            <div className="card space-y-3 p-4">
              <div className={cn('flex items-start gap-2 rounded-xl p-3 text-sm', stateUi[0])}>
                <StateIcon className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{a.state === 'CONFLICTS' ? `${a.conflictCount} ${stateUi[2]}` : stateUi[2]}</span>
              </div>
              {mr.approvals && (
                <p className="text-sm text-slate-600">
                  Approvals: <b>{mr.approvals.approvals}</b> / {mr.approvals.required}
                  {mr.approvals.stale > 0 && <span className="block text-xs text-amber-700">{mr.approvals.stale} review(s) are on an older version and don't count.</span>}
                </p>
              )}
              {mr.blockers.filter((b) => !b.startsWith('Nothing')).map((b) => <p key={b} className="flex items-center gap-1.5 text-xs text-red-700"><XCircle className="h-3.5 w-3.5" /> {b}</p>)}
              {mr.permissions.canMerge && a.state !== 'UP_TO_DATE' && (
                <>
                  <label className="flex items-center gap-2 text-xs text-slate-600"><input type="checkbox" className="accent-brand-600" checked={deleteBranch} onChange={(e) => setDeleteBranch(e.target.checked)} /> Delete <code>{mr.sourceBranchName}</code> after merging</label>
                  {a.state === 'CONFLICTS' ? (
                    <Button className="w-full" onClick={openConflicts} disabled={mr.blockers.length > 0}><AlertTriangle className="h-4 w-4" /> Resolve conflicts</Button>
                  ) : (
                    <Button className="w-full" loading={merging} disabled={mr.blockers.length > 0} onClick={() => merge()}><GitMerge className="h-4 w-4" /> Merge</Button>
                  )}
                </>
              )}
            </div>
          )}

          <div className="card p-4">
            <p className="mb-2 text-sm font-semibold text-slate-900">Reviewers</p>
            {mr.reviewers.length ? (
              <ul className="space-y-2">
                {mr.reviewers.map((r) => (
                  <li key={r.user?._id} className="flex items-center gap-2 text-sm">
                    <Avatar user={r.user} size="xs" /> <span className="flex-1 truncate">{r.user?.name}</span>
                    {r.state === 'APPROVED' ? <Check className="h-4 w-4 text-emerald-600" /> : r.state === 'CHANGES_REQUESTED' ? <XCircle className="h-4 w-4 text-red-600" /> : <span className="text-xs text-slate-400">pending</span>}
                  </li>
                ))}
              </ul>
            ) : <p className="text-sm text-slate-500">No reviewers requested.</p>}
            {mr.status === 'OPEN' && mr.permissions.canReview && (
              <div className="mt-3 grid grid-cols-2 gap-2">
                <Button size="sm" variant="secondary" onClick={() => setReviewing('APPROVED')}><Check className="h-4 w-4 text-emerald-600" /> Approve</Button>
                <Button size="sm" variant="secondary" onClick={() => setReviewing('CHANGES_REQUESTED')}><MessageSquare className="h-4 w-4 text-red-600" /> Request changes</Button>
              </div>
            )}
          </div>

          {(mr.permissions.canClose || mr.permissions.canReopen) && (
            <Button variant="ghost" size="sm" className="w-full" onClick={() => setStatus(mr.permissions.canClose ? 'close' : 'reopen')}>
              {mr.permissions.canClose ? 'Close merge request' : 'Reopen merge request'}
            </Button>
          )}
        </aside>
      </div>

      <Dialog open={!!reviewing} onClose={() => setReviewing(null)} title={reviewing === 'APPROVED' ? 'Approve this merge request' : 'Request changes'}>
        <div className="space-y-3">
          <Textarea rows={4} placeholder={reviewing === 'APPROVED' ? 'Optional comment' : 'What should be changed?'} value={reviewBody} onChange={(e) => setReviewBody(e.target.value)} />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setReviewing(null)}>Cancel</Button>
            <Button variant={reviewing === 'APPROVED' ? 'primary' : 'danger'} disabled={reviewing === 'CHANGES_REQUESTED' && !reviewBody.trim()} onClick={submitReview}>Submit review</Button>
          </div>
        </div>
      </Dialog>

      <Dialog open={!!conflicts} onClose={() => setConflicts(null)} title="Resolve merge conflicts" size="lg">
        {conflicts && (
          <ConflictResolver chunks={conflicts.chunks} labels={conflicts.labels} withMarkers={conflicts.withMarkers} submitting={merging} submitLabel="Resolve & merge" onCancel={() => setConflicts(null)} onResolve={(content) => merge(content)} />
        )}
      </Dialog>
    </div>
  );
}
