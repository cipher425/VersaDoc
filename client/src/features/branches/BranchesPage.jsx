import { useState } from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { GitBranch, GitPullRequest, Lock, Plus, Trash2, PenLine } from 'lucide-react';
import { http } from '../../lib/api';
import { docKeys, useBranches } from '../documents/api';
import { useAuth } from '../auth/AuthContext';
import { Button } from '../../components/ui/Button';
import { ConfirmDialog, Dialog } from '../../components/ui/Dialog';
import { Field, Input, Select } from '../../components/ui/Form';
import { Badge, ErrorState, Skeleton } from '../../components/ui/Feedback';
import { Avatar } from '../../components/ui/Avatar';
import { fromNow, shortHash } from '../../lib/format';

/** "3 ahead / 1 behind" bar, like GitHub's branch list. */
function AheadBehind({ ahead, behind }) {
  const max = Math.max(ahead, behind, 1);
  return (
    <div className="flex w-36 items-center gap-1 text-xs text-slate-500" title={`${ahead} ahead, ${behind} behind the default branch`}>
      <span className="w-6 text-right">{behind}</span>
      <div className="flex h-1.5 flex-1">
        <div className="flex flex-1 justify-end"><div className="h-full rounded-l bg-slate-300" style={{ width: `${(behind / max) * 100}%` }} /></div>
        <div className="w-px bg-slate-400" />
        <div className="flex-1"><div className="h-full rounded-r bg-brand-500" style={{ width: `${(ahead / max) * 100}%` }} /></div>
      </div>
      <span className="w-6">{ahead}</span>
    </div>
  );
}

export function BranchesPage() {
  const { doc, can } = useOutletContext();
  const { user } = useAuth();
  const qc = useQueryClient();
  const { data: branches, isLoading, error } = useBranches(doc._id);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [from, setFrom] = useState('');
  const [deleting, setDeleting] = useState(null);
  const [busy, setBusy] = useState(false);

  if (isLoading) return <Skeleton className="h-80" />;
  if (error) return <ErrorState error={error} />;
  const def = branches.find((b) => b.isDefault);

  const create = async () => {
    setBusy(true);
    try {
      await http.post(`/documents/${doc._id}/branches`, { name: name.trim(), from: from || def.name });
      toast.success(`Branch "${name}" created`);
      setCreating(false);
      setName('');
      qc.invalidateQueries({ queryKey: docKeys.branches(doc._id) });
      qc.invalidateQueries({ queryKey: docKeys.detail(doc._id) });
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    try {
      await http.delete(`/documents/${doc._id}/branches/${deleting._id}`);
      toast.success(`Branch "${deleting.name}" deleted`);
      setDeleting(null);
      qc.invalidateQueries({ queryKey: docKeys.branches(doc._id) });
      qc.invalidateQueries({ queryKey: docKeys.detail(doc._id) });
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">Branches let you try changes without touching <b>{def?.name}</b>. Merge them back with a merge request.</p>
        {can('edit') && <Button size="sm" onClick={() => setCreating(true)}><Plus className="h-4 w-4" /> New branch</Button>}
      </div>
      <ul className="card divide-y divide-slate-100">
        {branches.map((b) => (
          <li key={b._id} className="flex flex-col gap-3 p-4 md:flex-row md:items-center">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <GitBranch className="h-4 w-4 text-slate-400" />
                <Link to={`/d/${doc._id}?branch=${b._id}`} className="font-mono text-sm font-semibold text-slate-900 hover:text-brand-600">{b.name}</Link>
                {b.isDefault && <Badge tone="brand">default</Badge>}
                {b.protected && <Badge tone="amber"><Lock className="h-3 w-3" /> protected</Badge>}
                {b.openMergeRequest && (
                  <Link to={`/d/${doc._id}/merge-requests/${b.openMergeRequest}`}><Badge tone="green"><GitPullRequest className="h-3 w-3" /> !{b.openMergeRequest}</Badge></Link>
                )}
              </div>
              <p className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
                <Avatar user={b.head?.author} size="xs" /> {b.head?.message} · <span className="font-mono">{shortHash(b.head?.hash)}</span> · updated {fromNow(b.head?.createdAt)}
              </p>
            </div>
            {!b.isDefault && <AheadBehind ahead={b.ahead} behind={b.behind} />}
            <div className="flex items-center gap-1">
              <Button size="sm" variant="ghost" to={`/d/${doc._id}?branch=${b._id}`}><PenLine className="h-4 w-4" /> Open</Button>
              {!b.isDefault && can('edit') && !b.openMergeRequest && b.ahead > 0 && (
                <Button size="sm" variant="secondary" to={`/d/${doc._id}/merge-requests/new?source=${b._id}`}><GitPullRequest className="h-4 w-4" /> Merge request</Button>
              )}
              {!b.isDefault && can('edit') && (can('manage') || b.createdBy?._id === user._id) && (
                <Button size="sm" variant="ghost" onClick={() => setDeleting(b)} aria-label="Delete branch"><Trash2 className="h-4 w-4 text-red-600" /></Button>
              )}
            </div>
          </li>
        ))}
      </ul>

      <Dialog open={creating} onClose={() => setCreating(false)} title="Create a branch">
        <div className="space-y-4">
          <Field label="Branch name" hint="Short and descriptive, e.g. rewrite-abstract"><Input autoFocus value={name} onChange={(e) => setName(e.target.value.replace(/\s+/g, '-'))} /></Field>
          <Field label="Start from">
            <Select value={from || def?.name} onChange={(e) => setFrom(e.target.value)}>
              {branches.map((b) => <option key={b._id} value={b.name}>{b.name}</option>)}
            </Select>
          </Field>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setCreating(false)}>Cancel</Button>
            <Button loading={busy} disabled={!name.trim()} onClick={create}>Create branch</Button>
          </div>
        </div>
      </Dialog>
      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={remove}
        loading={busy}
        title="Delete branch?"
        message={deleting && `"${deleting.name}" will be deleted and its open merge requests closed. Commits already merged elsewhere stay in the history.`}
        confirmLabel="Delete branch"
      />
    </div>
  );
}
