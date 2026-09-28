import { useState } from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Trash2, UserPlus } from 'lucide-react';
import { http } from '../../lib/api';
import { docKeys } from './api';
import { Button } from '../../components/ui/Button';
import { ConfirmDialog } from '../../components/ui/Dialog';
import { Field, Input, Select, Textarea } from '../../components/ui/Form';
import { StatusBadge } from '../../components/ui/Feedback';
import { Avatar } from '../../components/ui/Avatar';

const ROLE_HELP = {
  editor: 'Edit, commit to unprotected branches, open and merge merge requests',
  reviewer: 'Read, comment and approve or request changes',
  viewer: 'Read only',
};

export function SettingsPage() {
  const { doc } = useOutletContext();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [general, setGeneral] = useState({ title: doc.title, description: doc.description || '', visibility: doc.visibility });
  const [settings, setSettings] = useState(doc.settings);
  const [invite, setInvite] = useState({ email: '', role: 'editor' });
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [confirmTitle, setConfirmTitle] = useState('');
  const refresh = () => qc.invalidateQueries({ queryKey: docKeys.detail(doc._id) });

  const run = async (fn, msg) => {
    try {
      await fn();
      if (msg) toast.success(msg);
      refresh();
    } catch (err) {
      toast.error(err.message);
    }
  };

  return (
    <div className="grid gap-6 xl:grid-cols-2">
      <section className="card space-y-4 p-5">
        <h2 className="font-semibold text-slate-900">General</h2>
        <Field label="Title"><Input value={general.title} onChange={(e) => setGeneral({ ...general, title: e.target.value })} /></Field>
        <Field label="Description"><Textarea rows={2} value={general.description} onChange={(e) => setGeneral({ ...general, description: e.target.value })} /></Field>
        <Field label="Visibility" hint={general.visibility === 'public' ? `Anyone with the link can read: ${window.location.origin}/p/${doc.slug}` : 'Only collaborators can see this document'}>
          <Select value={general.visibility} onChange={(e) => setGeneral({ ...general, visibility: e.target.value })}>
            <option value="private">Private</option>
            <option value="public">Public (read-only for everyone)</option>
          </Select>
        </Field>
        <Button onClick={() => run(() => http.patch(`/documents/${doc._id}`, general), 'Saved')}>Save</Button>
      </section>

      <section className="card space-y-4 p-5">
        <h2 className="font-semibold text-slate-900">Review rules</h2>
        <label className="flex items-start gap-3 text-sm">
          <input type="checkbox" className="mt-1 accent-brand-600" checked={settings.protectDefaultBranch} onChange={(e) => setSettings({ ...settings, protectDefaultBranch: e.target.checked })} />
          <span><b>Protect the default branch.</b> Only the owner can commit directly; everyone else goes through merge requests.</span>
        </label>
        <Field label="Required approvals before merging">
          <Select value={settings.requiredApprovals} onChange={(e) => setSettings({ ...settings, requiredApprovals: Number(e.target.value) })}>
            {[0, 1, 2, 3].map((n) => <option key={n} value={n}>{n}</option>)}
          </Select>
        </Field>
        <Button onClick={() => run(() => http.patch(`/documents/${doc._id}`, { settings }), 'Review rules saved')}>Save rules</Button>
      </section>

      <section className="card space-y-4 p-5 xl:col-span-2">
        <h2 className="font-semibold text-slate-900">Collaborators</h2>
        <form
          className="flex flex-col gap-2 sm:flex-row"
          onSubmit={(e) => {
            e.preventDefault();
            run(() => http.post(`/documents/${doc._id}/collaborators`, invite), `${invite.email} added`).then(() => setInvite({ ...invite, email: '' }));
          }}
        >
          <Input type="email" required placeholder="Email of a VersaDoc user" value={invite.email} onChange={(e) => setInvite({ ...invite, email: e.target.value })} />
          <Select className="sm:w-40" value={invite.role} onChange={(e) => setInvite({ ...invite, role: e.target.value })}>
            <option value="editor">Editor</option>
            <option value="reviewer">Reviewer</option>
            <option value="viewer">Viewer</option>
          </Select>
          <Button type="submit"><UserPlus className="h-4 w-4" /> Invite</Button>
        </form>
        <p className="text-xs text-slate-500">{Object.entries(ROLE_HELP).map(([r, t]) => <span key={r} className="mr-4 inline-block"><b className="capitalize">{r}:</b> {t}</span>)}</p>
        <ul className="divide-y divide-slate-100">
          <li className="flex items-center gap-3 py-3">
            <Avatar user={doc.owner} size="sm" />
            <span className="flex-1 text-sm"><b>{doc.owner.name}</b> <span className="text-slate-500">{doc.owner.email}</span></span>
            <StatusBadge status="owner" />
          </li>
          {doc.collaborators.map((c) => (
            <li key={c.user._id} className="flex items-center gap-3 py-3">
              <Avatar user={c.user} size="sm" />
              <span className="min-w-0 flex-1 truncate text-sm"><b>{c.user.name}</b> <span className="text-slate-500">{c.user.email}</span></span>
              <Select className="h-8 w-32" value={c.role} onChange={(e) => run(() => http.patch(`/documents/${doc._id}/collaborators/${c.user._id}`, { role: e.target.value }), 'Role updated')}>
                <option value="editor">Editor</option>
                <option value="reviewer">Reviewer</option>
                <option value="viewer">Viewer</option>
              </Select>
              <Button size="sm" variant="ghost" onClick={() => run(() => http.delete(`/documents/${doc._id}/collaborators/${c.user._id}`), 'Removed')}><Trash2 className="h-4 w-4 text-red-600" /></Button>
            </li>
          ))}
        </ul>
      </section>

      <section className="card space-y-3 border-red-200 p-5 xl:col-span-2">
        <h2 className="font-semibold text-red-700">Danger zone</h2>
        <p className="text-sm text-slate-600">Deleting removes every branch, commit, merge request and comment. This cannot be undone.</p>
        <Button variant="danger" onClick={() => setDeleteOpen(true)}><Trash2 className="h-4 w-4" /> Delete document</Button>
      </section>

      <ConfirmDialog
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        title="Delete this document?"
        confirmLabel="Delete forever"
        onConfirm={() => {
          if (confirmTitle !== doc.title) return toast.error('Type the exact title to confirm');
          run(async () => {
            await http.delete(`/documents/${doc._id}`);
            navigate('/documents');
          }, 'Document deleted');
        }}
      >
        <p className="mb-2 text-sm text-slate-600">Type <b>{doc.title}</b> to confirm.</p>
        <Input value={confirmTitle} onChange={(e) => setConfirmTitle(e.target.value)} />
      </ConfirmDialog>
    </div>
  );
}
