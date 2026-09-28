import { useState } from 'react';
import { Link, useNavigate, useOutletContext, useParams, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ArrowLeftRight, GitCommitHorizontal, GitMerge, RotateCcw, FileSearch, Copy, ScanText } from 'lucide-react';
import { http } from '../../lib/api';
import { docKeys, pickBranch, useBranches } from '../documents/api';
import { DiffViewer } from '../diff/DiffViewer';
import { MarkdownPreview } from '../editor/MarkdownPreview';
import { Button } from '../../components/ui/Button';
import { ConfirmDialog } from '../../components/ui/Dialog';
import { Input, Select } from '../../components/ui/Form';
import { Badge, EmptyState, ErrorState, PageLoader, Skeleton } from '../../components/ui/Feedback';
import { Pagination, Tabs } from '../../components/ui/Layout';
import { Avatar } from '../../components/ui/Avatar';
import { formatDateTime, fromNow, shortHash } from '../../lib/format';

function CommitIcon({ commit }) {
  if (commit.kind === 'merge') return <GitMerge className="h-4 w-4 text-violet-600" />;
  if (commit.kind === 'revert') return <RotateCcw className="h-4 w-4 text-amber-600" />;
  return <GitCommitHorizontal className="h-4 w-4 text-brand-600" />;
}

const copy = (text) => navigator.clipboard?.writeText(text).then(() => toast.success('Copied'));

/* ------------------------------- History ------------------------------- */

export function HistoryPage() {
  const { doc, can } = useOutletContext();
  const [params, setParams] = useSearchParams();
  const qc = useQueryClient();
  const branches = useBranches(doc._id);
  const branch = pickBranch(branches.data, params.get('branch'), doc.defaultBranch?._id);
  const page = Number(params.get('page') || 1);
  const [restoring, setRestoring] = useState(null);
  const [busy, setBusy] = useState(false);

  const log = useQuery({
    queryKey: docKeys.log(doc._id, branch?.name, page),
    queryFn: () => http.get(`/documents/${doc._id}/commits`, { ref: branch.name, page, limit: 25 }),
    enabled: !!branch,
  });

  const restore = async () => {
    setBusy(true);
    try {
      const { data } = await http.post(`/documents/${doc._id}/branches/${branch._id}/restore`, { commitId: restoring._id });
      toast.success(`Restored as new commit ${shortHash(data.hash)}`);
      setRestoring(null);
      qc.invalidateQueries({ queryKey: ['log', doc._id] });
      qc.invalidateQueries({ queryKey: docKeys.branches(doc._id) });
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  if (!branch) return <Skeleton className="h-96" />;
  const canRestore = can('edit') && (!branch.protected || can('manage'));

  // Group commits by day, like GitHub.
  const groups = [];
  for (const c of log.data?.data || []) {
    const day = new Date(c.createdAt).toDateString();
    if (groups.at(-1)?.day !== day) groups.push({ day, commits: [] });
    groups.at(-1).commits.push(c);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Select value={branch._id} onChange={(e) => setParams({ branch: e.target.value })} className="h-9 w-56">
          {branches.data.map((b) => <option key={b._id} value={b._id}>{b.name}</option>)}
        </Select>
        <span className="text-sm text-slate-500">{log.data?.meta?.total ?? '…'} commits</span>
        <div className="ml-auto flex gap-2">
          <Button size="sm" variant="secondary" to={`/d/${doc._id}/blame?branch=${branch._id}`}><ScanText className="h-4 w-4" /> Blame</Button>
          <Button size="sm" variant="secondary" to={`/d/${doc._id}/compare`}><ArrowLeftRight className="h-4 w-4" /> Compare versions</Button>
        </div>
      </div>
      {log.isLoading ? (
        <Skeleton className="h-96" />
      ) : log.error ? (
        <ErrorState error={log.error} />
      ) : (
        groups.map((g) => (
          <section key={g.day}>
            <p className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500"><GitCommitHorizontal className="h-4 w-4" /> Commits on {new Date(g.day).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
            <ul className="card divide-y divide-slate-100">
              {g.commits.map((c, i) => (
                <li key={c._id} className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center">
                  <div className="flex min-w-0 flex-1 items-start gap-3">
                    <CommitIcon commit={c} />
                    <div className="min-w-0">
                      <Link to={`/d/${doc._id}/commits/${c._id}`} className="block truncate font-medium text-slate-900 hover:text-brand-600">{c.message}</Link>
                      <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
                        <Avatar user={c.author} size="xs" /> <b className="text-slate-700">{c.author?.name}</b> committed {fromNow(c.createdAt)}
                        <span className="text-emerald-600">+{c.stats.additions}</span>
                        <span className="text-red-600">-{c.stats.deletions}</span>
                        <Badge tone={c.storage === 'snapshot' ? 'violet' : 'gray'}>{c.storage === 'snapshot' ? 'snapshot' : `delta · ${c.stats.storedBytes} B`}</Badge>
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <button onClick={() => copy(c.hash)} className="flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 font-mono text-xs text-slate-600 hover:bg-slate-50"><Copy className="h-3 w-3" /> {shortHash(c.hash)}</button>
                    <Button size="sm" variant="ghost" to={`/d/${doc._id}/compare?from=${c.hash.slice(0, 7)}&to=${branch.name}`} title="Compare with latest"><ArrowLeftRight className="h-4 w-4" /></Button>
                    {canRestore && !(page === 1 && groups[0] === g && i === 0) && (
                      <Button size="sm" variant="ghost" onClick={() => setRestoring(c)} title="Restore this version"><RotateCcw className="h-4 w-4" /></Button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
      <Pagination meta={log.data?.meta} onPage={(p) => setParams({ branch: branch._id, page: p })} />
      <ConfirmDialog
        open={!!restoring}
        onClose={() => setRestoring(null)}
        onConfirm={restore}
        loading={busy}
        tone="primary"
        confirmLabel="Restore"
        title="Restore this version?"
        message={restoring && `A new commit will be added to "${branch.name}" with the content of ${shortHash(restoring.hash)} ("${restoring.message}"). Nothing in the history is deleted.`}
      />
    </div>
  );
}

/* -------------------------------- Commit -------------------------------- */

export function CommitPage() {
  const { doc } = useOutletContext();
  const { commitId } = useParams();
  const [tab, setTab] = useState('changes');
  const { data, isLoading, error } = useQuery({ queryKey: docKeys.commit(doc._id, commitId), queryFn: () => http.get(`/documents/${doc._id}/commits/${commitId}`).then((r) => r.data) });
  const content = useQuery({
    queryKey: ['commit-content', commitId],
    queryFn: () => http.get(`/documents/${doc._id}/commits/${commitId}/content`).then((r) => r.data),
    enabled: tab === 'document',
  });
  if (isLoading) return <PageLoader />;
  if (error) return <ErrorState error={error} />;
  const { commit, parents, diff } = data;

  return (
    <div className="space-y-4">
      <div className="card p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="flex items-center gap-2 text-lg font-bold text-slate-900"><CommitIcon commit={commit} /> {commit.message}</h2>
            <p className="mt-1 flex flex-wrap items-center gap-1.5 text-sm text-slate-500">
              <Avatar user={commit.author} size="xs" /> <b className="text-slate-700">{commit.author?.name}</b> · {formatDateTime(commit.createdAt)} · on <code className="text-xs">{commit.branchName}</code>
            </p>
          </div>
          <div className="text-right text-xs text-slate-500">
            <p>commit <button onClick={() => copy(commit.hash)} className="font-mono text-slate-800 hover:text-brand-600">{commit.hash}</button></p>
            {parents.length > 0 && (
              <p className="mt-1">
                {parents.length > 1 ? 'parents' : 'parent'}{' '}
                {parents.map((p) => <Link key={p._id} to={`/d/${doc._id}/commits/${p._id}`} className="ml-1 font-mono text-brand-600 hover:underline">{shortHash(p.hash)}</Link>)}
              </p>
            )}
            <p className="mt-1">Stored as <b>{commit.storage}</b> · {commit.stats.storedBytes.toLocaleString()} of {commit.stats.fullBytes.toLocaleString()} bytes</p>
          </div>
        </div>
      </div>
      <Tabs tabs={[{ value: 'changes', label: 'Changes' }, { value: 'document', label: 'Document at this version' }]} value={tab} onChange={setTab} />
      {tab === 'changes' ? (
        <DiffViewer diff={diff} />
      ) : content.isLoading ? (
        <Skeleton className="h-96" />
      ) : (
        <div className="card px-6 py-5 sm:px-10"><MarkdownPreview text={content.data?.content} /></div>
      )}
    </div>
  );
}

/* -------------------------------- Compare -------------------------------- */

export function ComparePage() {
  const { doc } = useOutletContext();
  const [params, setParams] = useSearchParams();
  const branches = useBranches(doc._id);
  const [from, setFrom] = useState(params.get('from') || '');
  const [to, setTo] = useState(params.get('to') || '');
  const active = { from: params.get('from'), to: params.get('to') };
  const result = useQuery({
    queryKey: ['compare', doc._id, active.from, active.to],
    queryFn: () => http.get(`/documents/${doc._id}/compare`, active).then((r) => r.data),
    enabled: Boolean(active.from && active.to),
  });
  const refOptions = (branches.data || []).map((b) => b.name);

  return (
    <div className="space-y-4">
      <form
        className="card flex flex-col gap-3 p-4 sm:flex-row sm:items-end"
        onSubmit={(e) => {
          e.preventDefault();
          setParams({ from: from.trim(), to: to.trim() });
        }}
      >
        {[['Base', from, setFrom], ['Compare', to, setTo]].map(([label, value, set]) => (
          <label key={label} className="flex-1 space-y-1.5">
            <span className="text-sm font-medium text-slate-700">{label}</span>
            <Input list="refs" value={value} onChange={(e) => set(e.target.value)} placeholder="branch name or commit hash" />
          </label>
        ))}
        <datalist id="refs">{refOptions.map((r) => <option key={r} value={r} />)}</datalist>
        <Button type="submit" disabled={!from || !to}><FileSearch className="h-4 w-4" /> Compare</Button>
      </form>
      {!active.from || !active.to ? (
        <EmptyState icon={ArrowLeftRight} title="Compare any two versions" message="Pick two branches, or paste commit hashes from the History tab (7 characters is enough)." />
      ) : result.isLoading ? (
        <Skeleton className="h-96" />
      ) : result.error ? (
        <ErrorState error={result.error} />
      ) : (
        <>
          <p className="text-sm text-slate-600">
            <code className="rounded bg-slate-100 px-1.5">{shortHash(result.data.from.hash)}</code> {result.data.from.message} → <code className="rounded bg-slate-100 px-1.5">{shortHash(result.data.to.hash)}</code> {result.data.to.message}
          </p>
          <DiffViewer diff={result.data.diff} defaultMode="split" />
        </>
      )}
    </div>
  );
}

/* --------------------------------- Blame --------------------------------- */

export function BlamePage() {
  const { doc } = useOutletContext();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const branches = useBranches(doc._id);
  const branch = pickBranch(branches.data, params.get('branch'), doc.defaultBranch?._id);
  const { data, isLoading, error } = useQuery({
    queryKey: ['blame', doc._id, branch?._id, branch?.head?._id],
    queryFn: () => http.get(`/documents/${doc._id}/branches/${branch._id}/blame`).then((r) => r.data),
    enabled: !!branch,
  });
  if (!branch || isLoading) return <Skeleton className="h-96" />;
  if (error) return <ErrorState error={error} />;
  const commits = new Map(data.commits.map((c) => [c._id, c]));

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Select value={branch._id} onChange={(e) => navigate(`?branch=${e.target.value}`)} className="h-9 w-56">
          {branches.data.map((b) => <option key={b._id} value={b._id}>{b.name}</option>)}
        </Select>
        <p className="text-sm text-slate-500">Who last changed each line{data.truncated && ' (older history summarised)'}</p>
      </div>
      <div className="card overflow-x-auto">
        <table className="w-full border-collapse text-[13px]">
          <tbody>
            {data.blocks.map((block, bi) => {
              const c = commits.get(block.commitId);
              return block.lines.map((line, li) => (
                <tr key={`${bi}-${li}`} className={li === 0 ? 'border-t border-slate-200' : ''}>
                  <td className="w-72 max-w-72 border-r border-slate-100 bg-slate-50/70 px-3 py-0.5 align-top">
                    {li === 0 && c && (
                      <Link to={`/d/${doc._id}/commits/${c._id}`} className="flex items-center gap-2 hover:text-brand-600">
                        <Avatar user={c.author} size="xs" />
                        <span className="truncate text-xs font-medium">{c.message}</span>
                        <span className="ml-auto shrink-0 text-[11px] text-slate-400">{fromNow(c.createdAt)}</span>
                      </Link>
                    )}
                  </td>
                  <td className="w-10 select-none px-2 text-right font-mono text-xs text-slate-400">{block.startLine + li}</td>
                  <td className="whitespace-pre-wrap break-words px-3 font-mono">{line || ' '}</td>
                </tr>
              ));
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
