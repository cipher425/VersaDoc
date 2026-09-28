import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { FilePlus2, FileText, Globe, Lock, Search } from 'lucide-react';
import { http } from '../../lib/api';
import { useDebounce } from '../../hooks/useCommon';
import { Button } from '../../components/ui/Button';
import { Dialog } from '../../components/ui/Dialog';
import { Field, Input, Select, Textarea } from '../../components/ui/Form';
import { EmptyState, ErrorState, Skeleton, StatusBadge } from '../../components/ui/Feedback';
import { PageHeader, Pagination, Tabs } from '../../components/ui/Layout';
import { Avatar } from '../../components/ui/Avatar';
import { fromNow, plural } from '../../lib/format';

export function NewDocumentDialog({ open, onClose }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const templates = useQuery({ queryKey: ['templates'], queryFn: () => http.get('/documents/templates').then((r) => r.data), staleTime: Infinity });
  const { register, handleSubmit, formState, reset } = useForm({ defaultValues: { title: '', description: '', template: 'report', visibility: 'private' } });

  const onSubmit = async (values) => {
    try {
      const { data } = await http.post('/documents', values);
      qc.invalidateQueries({ queryKey: ['documents'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      toast.success('Document created with a "main" branch and its first commit');
      reset();
      onClose();
      navigate(`/d/${data._id}`);
    } catch (err) {
      toast.error(err.details?.[0]?.message || err.message);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} title="New document">
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <Field label="Title"><Input required minLength={2} placeholder="e.g. Final Year Project Report" {...register('title')} /></Field>
        <Field label="Description (optional)"><Textarea rows={2} {...register('description')} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Start from">
            <Select {...register('template')}>
              {(templates.data || [{ id: 'blank', label: 'Blank document' }]).map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
            </Select>
          </Field>
          <Field label="Visibility">
            <Select {...register('visibility')}>
              <option value="private">Private (invited only)</option>
              <option value="public">Public (anyone can read)</option>
            </Select>
          </Field>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={formState.isSubmitting}>Create document</Button>
        </div>
      </form>
    </Dialog>
  );
}

export function DocumentCard({ doc }) {
  return (
    <Link to={`/d/${doc._id}`} className="card flex flex-col p-5 transition hover:-translate-y-0.5 hover:shadow-md">
      <div className="flex items-start justify-between gap-2">
        <span className="rounded-xl bg-brand-50 p-2"><FileText className="h-5 w-5 text-brand-600" /></span>
        <div className="flex items-center gap-1.5">
          {doc.visibility === 'public' ? <Globe className="h-4 w-4 text-emerald-600" /> : <Lock className="h-4 w-4 text-slate-400" />}
          {doc.myRole && <StatusBadge status={doc.myRole} />}
        </div>
      </div>
      <h3 className="mt-3 line-clamp-2 font-semibold text-slate-900">{doc.title}</h3>
      {doc.description && <p className="mt-1 line-clamp-2 text-sm text-slate-500">{doc.description}</p>}
      <div className="mt-auto flex items-center justify-between pt-4 text-xs text-slate-500">
        <span className="flex items-center gap-1.5"><Avatar user={doc.owner} size="xs" /> {doc.owner?.name}</span>
        <span>{plural(doc.stats?.commits || 0, 'commit')} · {fromNow(doc.lastActivityAt)}</span>
      </div>
    </Link>
  );
}

export function DocumentsPage() {
  const [filter, setFilter] = useState('all');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);
  const debounced = useDebounce(q);
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['documents', filter, debounced, page],
    queryFn: () => http.get('/documents', { filter, q: debounced || undefined, page, limit: 12 }),
  });

  return (
    <div className="container-page py-8">
      <PageHeader title="Documents" subtitle="Everything you own or collaborate on." actions={<Button onClick={() => setCreating(true)}><FilePlus2 className="h-4 w-4" /> New document</Button>} />
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Tabs tabs={[{ value: 'all', label: 'All' }, { value: 'owned', label: 'Owned by me' }, { value: 'shared', label: 'Shared with me' }]} value={filter} onChange={(v) => { setFilter(v); setPage(1); }} />
        <div className="relative sm:w-72">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input className="pl-9" placeholder="Search titles" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} />
        </div>
      </div>
      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-44" />)}</div>
      ) : error ? (
        <ErrorState error={error} onRetry={refetch} />
      ) : !data.data.length ? (
        <EmptyState icon={FileText} title="No documents yet" message="Create your first document - it starts with a main branch and full version history." action={<Button onClick={() => setCreating(true)}>New document</Button>} />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{data.data.map((d) => <DocumentCard key={d._id} doc={d} />)}</div>
      )}
      <Pagination meta={data?.meta} onPage={setPage} />
      <NewDocumentDialog open={creating} onClose={() => setCreating(false)} />
    </div>
  );
}
