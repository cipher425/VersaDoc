import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useOutletContext, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import CodeMirror, { EditorView } from '@uiw/react-codemirror';
import { markdown } from '@codemirror/lang-markdown';
import { toast } from 'sonner';
import { AlertTriangle, Check, CloudOff, Columns2, Eye, GitBranch, GitCommitHorizontal, Loader2, Lock, PenLine, RefreshCw, Trash2, Download } from 'lucide-react';
import { http } from '../../lib/api';
import { docKeys, pickBranch, useBranches } from '../documents/api';
import { useDebounce } from '../../hooks/useCommon';
import { MarkdownPreview } from './MarkdownPreview';
import { DiffViewer } from '../diff/DiffViewer';
import { ConflictResolver } from '../diff/ConflictResolver';
import { Button } from '../../components/ui/Button';
import { Dialog, ConfirmDialog } from '../../components/ui/Dialog';
import { Field, Input, Select } from '../../components/ui/Form';
import { ErrorState, Skeleton } from '../../components/ui/Feedback';
import { Avatar } from '../../components/ui/Avatar';
import { fromNow, shortHash } from '../../lib/format';
import { cn } from '../../lib/cn';

const extensions = [markdown(), EditorView.lineWrapping];

function SaveIndicator({ save }) {
  if (save.state === 'saving') return <span className="flex items-center gap-1 text-xs text-slate-500"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Saving…</span>;
  if (save.state === 'error') return <span className="flex items-center gap-1 text-xs text-red-600"><CloudOff className="h-3.5 w-3.5" /> Not saved</span>;
  if (save.state === 'unsaved') return <span className="text-xs text-slate-500">Unsaved changes</span>;
  return <span className="flex items-center gap-1 text-xs text-slate-500"><Check className="h-3.5 w-3.5 text-emerald-600" /> {save.dirty ? 'Draft saved' : 'Up to date'}</span>;
}

function CommitDialog({ open, onClose, docId, branch, onCommit, committing }) {
  const [message, setMessage] = useState('');
  const diff = useQuery({
    queryKey: ['draft-diff', docId, branch?._id],
    queryFn: () => http.get(`/documents/${docId}/branches/${branch._id}/draft/diff`).then((r) => r.data),
    enabled: open && !!branch,
    gcTime: 0,
  });
  return (
    <Dialog open={open} onClose={onClose} title={`Commit to ${branch?.name}`} size="lg">
      <div className="space-y-4">
        <Field label="Commit message" hint="Describe what you changed and why, e.g. 'Add results from the Lot B pilot'">
          <Input autoFocus value={message} onChange={(e) => setMessage(e.target.value)} placeholder="What did you change?" onKeyDown={(e) => e.key === 'Enter' && message.trim().length >= 3 && onCommit(message)} />
        </Field>
        <div>
          <p className="mb-2 text-sm font-medium text-slate-700">Changes in this commit</p>
          {diff.isLoading ? <Skeleton className="h-40" /> : diff.data && <div className="max-h-80 overflow-y-auto"><DiffViewer diff={diff.data} /></div>}
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button loading={committing} disabled={message.trim().length < 3} onClick={() => onCommit(message)}>
            <GitCommitHorizontal className="h-4 w-4" /> Commit
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

export function EditorPage() {
  const { doc, can } = useOutletContext();
  const qc = useQueryClient();
  const [params, setParams] = useSearchParams();
  const branches = useBranches(doc._id);
  const branch = pickBranch(branches.data, params.get('branch'), doc.defaultBranch?._id);
  const canEdit = can('edit');
  const mustBranch = branch?.protected && !can('manage'); // protected branch: editors propose via a new branch

  const draftUrl = branch ? `/documents/${doc._id}/branches/${branch._id}/draft` : null;
  const draftQ = useQuery({
    queryKey: docKeys.draft(doc._id, branch?._id),
    queryFn: () => http.get(draftUrl).then((r) => r.data),
    enabled: !!branch,
    staleTime: 0,
    gcTime: 0,
    refetchOnWindowFocus: false,
  });

  const [text, setText] = useState('');
  const [base, setBase] = useState(null);
  const [save, setSave] = useState({ state: 'saved', dirty: false, stale: false });
  const [view, setView] = useState(() => (window.innerWidth < 1024 ? 'edit' : 'split'));
  const [commitOpen, setCommitOpen] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [conflict, setConflict] = useState(null);
  const [rebasing, setRebasing] = useState(false);
  const [branchDialog, setBranchDialog] = useState(false);
  const [newBranch, setNewBranch] = useState('');
  const [discardOpen, setDiscardOpen] = useState(false);
  const lastSaved = useRef(null);
  const seq = useRef(0);

  // (Re)load the editor whenever the server state for this branch is (re)fetched.
  useEffect(() => {
    if (!draftQ.data) return;
    setText(draftQ.data.content);
    setBase(draftQ.data.baseCommit);
    lastSaved.current = draftQ.data.content;
    setSave({ state: 'saved', dirty: draftQ.data.dirty, stale: draftQ.data.stale });
  }, [draftQ.data]);

  const saveNow = useCallback(
    async (content) => {
      if (!canEdit || !base || !draftUrl || content === lastSaved.current) return true;
      const mySeq = ++seq.current;
      setSave((s) => ({ ...s, state: 'saving' }));
      try {
        const { data } = await http.put(draftUrl, { content, baseCommit: base });
        if (mySeq === seq.current) {
          lastSaved.current = content;
          setSave({ state: 'saved', dirty: data.dirty, stale: Boolean(data.stale) });
        }
        return true;
      } catch (err) {
        setSave((s) => ({ ...s, state: 'error' }));
        toast.error(err.message);
        return false;
      }
    },
    [canEdit, base, draftUrl]
  );

  // Autosave 1.2 s after the user stops typing.
  const debounced = useDebounce(text, 1200);
  useEffect(() => {
    if (draftQ.data && debounced !== lastSaved.current) saveNow(debounced);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced]);

  // Ctrl/Cmd + S saves immediately; warn before leaving with unsaved text.
  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        saveNow(text);
      }
    };
    const onLeave = (e) => {
      if (text !== lastSaved.current) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('beforeunload', onLeave);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('beforeunload', onLeave);
    };
  }, [text, saveNow]);

  const onChange = (value) => {
    setText(value);
    setSave((s) => ({ ...s, state: value === lastSaved.current ? s.state : 'unsaved' }));
  };

  const refreshAll = () => {
    qc.invalidateQueries({ queryKey: docKeys.draft(doc._id, branch._id) });
    qc.invalidateQueries({ queryKey: docKeys.branches(doc._id) });
    qc.invalidateQueries({ queryKey: docKeys.detail(doc._id) });
  };

  const switchBranch = async (id) => {
    await saveNow(text);
    setParams({ branch: id });
  };

  const openCommit = async () => {
    if (!(await saveNow(text))) return;
    if (mustBranch) return setBranchDialog(true);
    setCommitOpen(true);
  };

  const commit = async (message) => {
    setCommitting(true);
    try {
      const { data } = await http.post(`/documents/${doc._id}/branches/${branch._id}/commits`, { message });
      toast.success(`Committed ${shortHash(data.hash)} to ${branch.name}`);
      setCommitOpen(false);
      refreshAll();
    } catch (err) {
      if (err.code === 'BRANCH_MOVED') setSave((s) => ({ ...s, stale: true }));
      if (err.code === 'PROTECTED_BRANCH') {
        setCommitOpen(false);
        setBranchDialog(true);
      }
      toast.error(err.message);
    } finally {
      setCommitting(false);
    }
  };

  const applyRebase = (data) => {
    setText(data.content);
    setBase(data.baseCommit);
    lastSaved.current = data.content;
    setSave({ state: 'saved', dirty: true, stale: false });
    setConflict(null);
    qc.invalidateQueries({ queryKey: docKeys.branches(doc._id) });
  };

  const rebase = async (resolvedContent) => {
    if (resolvedContent === undefined && !(await saveNow(text))) return;
    setRebasing(true);
    try {
      const { data } = await http.post(`${draftUrl}/rebase`, resolvedContent === undefined ? {} : { resolvedContent });
      if (data.status === 'CONFLICTS') setConflict(data);
      else {
        applyRebase(data);
        toast.success(data.status === 'UP_TO_DATE' ? 'Already up to date' : 'Draft updated with the latest changes');
      }
    } catch (err) {
      toast.error(err.message);
    } finally {
      setRebasing(false);
    }
  };

  const discard = async () => {
    await http.delete(draftUrl);
    setDiscardOpen(false);
    toast.success('Draft discarded');
    refreshAll();
  };

  /** Protected branch: move my work onto a new branch, then I can commit there. */
  const moveToNewBranch = async () => {
    try {
      const { data: created } = await http.post(`/documents/${doc._id}/branches`, { name: newBranch.trim(), from: branch.name });
      await http.put(`/documents/${doc._id}/branches/${created._id}/draft`, { content: text, baseCommit: base });
      await http.delete(draftUrl);
      lastSaved.current = text;
      setBranchDialog(false);
      setNewBranch('');
      qc.invalidateQueries({ queryKey: docKeys.branches(doc._id) });
      setParams({ branch: created._id });
      toast.success(`Your changes are now on "${created.name}". Commit them, then open a merge request.`);
    } catch (err) {
      toast.error(err.message);
    }
  };

  if (branches.error) return <ErrorState error={branches.error} />;
  if (!branch || draftQ.isLoading) return <Skeleton className="h-[70vh]" />;
  if (draftQ.error) return <ErrorState error={draftQ.error} onRetry={draftQ.refetch} />;

  const head = draftQ.data.head;
  const words = (text.match(/\S+/g) || []).length;

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1.5">
          <GitBranch className="h-4 w-4 text-slate-400" />
          <Select value={branch._id} onChange={(e) => switchBranch(e.target.value)} className="h-9 w-48">
            {branches.data.map((b) => (
              <option key={b._id} value={b._id}>{b.name}{b.isDefault ? ' (default)' : ''}</option>
            ))}
          </Select>
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <Avatar user={head.author} size="xs" />
          <Link to={`/d/${doc._id}/commits/${head._id}`} className="font-mono hover:text-brand-600">{shortHash(head.hash)}</Link>
          <span className="hidden max-w-60 truncate md:inline">{head.message}</span>
          <span className="hidden md:inline">· {fromNow(head.createdAt)}</span>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {canEdit && <SaveIndicator save={save} />}
          <div className="flex rounded-lg border border-slate-200 bg-white p-0.5">
            {[['edit', PenLine, 'Write'], ['split', Columns2, 'Split'], ['preview', Eye, 'Preview']].map(([v, Icon, label]) => (
              <button key={v} onClick={() => setView(v)} className={cn('flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium', view === v ? 'bg-slate-900 text-white' : 'text-slate-600', v === 'split' && 'hidden lg:flex')}>
                <Icon className="h-3.5 w-3.5" /> {label}
              </button>
            ))}
          </div>
          <a href={`/api/v1/documents/${doc._id}/commits/${head._id}/content?download=1`} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" title="Download this version (.md)" onClick={async (e) => {
            e.preventDefault();
            const blob = new Blob([text], { type: 'text/markdown' });
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = `${doc.slug}.md`;
            a.click();
          }}>
            <Download className="h-4 w-4" />
          </a>
          {canEdit && save.dirty && <Button variant="ghost" size="sm" onClick={() => setDiscardOpen(true)}><Trash2 className="h-4 w-4" /> Discard</Button>}
          {canEdit && (
            <Button size="sm" onClick={openCommit} disabled={!save.dirty && text === lastSaved.current}>
              <GitCommitHorizontal className="h-4 w-4" /> {mustBranch ? 'Propose changes' : 'Commit'}
            </Button>
          )}
        </div>
      </div>

      {/* Banners */}
      {!canEdit && (
        <p className="flex items-center gap-2 rounded-xl bg-slate-100 px-4 py-2.5 text-sm text-slate-600"><Lock className="h-4 w-4" /> You have {doc.myRole} access - this document is read-only for you.</p>
      )}
      {canEdit && mustBranch && (
        <p className="flex items-center gap-2 rounded-xl bg-sky-50 px-4 py-2.5 text-sm text-sky-900">
          <Lock className="h-4 w-4" /> <b>{branch.name}</b> is protected. You can write here - when you're done, “Propose changes” moves your edits to a new branch for review.
        </p>
      )}
      {canEdit && save.stale && (
        <div className="flex flex-col gap-2 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900 sm:flex-row sm:items-center sm:justify-between">
          <span className="flex items-center gap-2"><AlertTriangle className="h-4 w-4" /> Someone committed to <b>{branch.name}</b> after you started editing. Update your draft before committing.</span>
          <Button size="sm" variant="secondary" loading={rebasing} onClick={() => rebase()}><RefreshCw className="h-4 w-4" /> Update draft</Button>
        </div>
      )}

      {/* Editor + preview */}
      <div className={cn('grid gap-3', view === 'split' && 'lg:grid-cols-2')}>
        {view !== 'preview' && (
          <div className="card h-[calc(100vh-300px)] min-h-[440px] overflow-hidden">
            <CodeMirror
              value={text}
              onChange={onChange}
              extensions={extensions}
              editable={canEdit}
              height="100%"
              basicSetup={{ lineNumbers: true, foldGutter: false, highlightActiveLine: canEdit, autocompletion: false }}
            />
          </div>
        )}
        {view !== 'edit' && (
          <div className="card h-[calc(100vh-300px)] min-h-[440px] overflow-y-auto px-6 py-5 sm:px-10">
            <MarkdownPreview text={text} />
          </div>
        )}
      </div>
      <p className="text-right text-xs text-slate-400">{words.toLocaleString()} words · {text.split('\n').length} lines · Ctrl+S to save</p>

      <CommitDialog open={commitOpen} onClose={() => setCommitOpen(false)} docId={doc._id} branch={branch} onCommit={commit} committing={committing} />

      <Dialog open={branchDialog} onClose={() => setBranchDialog(false)} title="Propose changes on a new branch">
        <div className="space-y-4">
          <p className="text-sm text-slate-600">Your edits will move to a new branch created from <b>{branch.name}</b>. Commit them there and open a merge request so a teammate can review.</p>
          <Field label="Branch name" hint="e.g. fix-introduction or add-references"><Input autoFocus value={newBranch} onChange={(e) => setNewBranch(e.target.value.replace(/\s+/g, '-'))} /></Field>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setBranchDialog(false)}>Cancel</Button>
            <Button disabled={!newBranch.trim()} onClick={moveToNewBranch}><GitBranch className="h-4 w-4" /> Create branch</Button>
          </div>
        </div>
      </Dialog>

      <ConfirmDialog open={discardOpen} onClose={() => setDiscardOpen(false)} onConfirm={discard} title="Discard your draft?" message={`Your uncommitted changes on "${branch.name}" will be deleted. Committed versions are not affected.`} confirmLabel="Discard" />

      <Dialog open={!!conflict} onClose={() => setConflict(null)} title="Update your draft" size="lg">
        {conflict && (
          <ConflictResolver
            chunks={conflict.chunks}
            labels={conflict.labels}
            withMarkers={conflict.withMarkers}
            submitting={rebasing}
            submitLabel="Update draft"
            onCancel={() => setConflict(null)}
            onResolve={(content) => rebase(content)}
          />
        )}
      </Dialog>
    </div>
  );
}
