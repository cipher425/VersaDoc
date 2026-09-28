import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { FilePlus2, GitPullRequest, Activity as ActivityIcon, Eye } from 'lucide-react';
import { http } from '../../lib/api';
import { useAuth } from '../auth/AuthContext';
import { DocumentCard, NewDocumentDialog } from '../documents/DocumentsPage';
import { ActivityItem } from '../insights/ActivityItem';
import { Button } from '../../components/ui/Button';
import { EmptyState, ErrorState, Skeleton } from '../../components/ui/Feedback';
import { Avatar } from '../../components/ui/Avatar';
import { fromNow } from '../../lib/format';

function MrRow({ mr }) {
  return (
    <Link to={`/d/${mr.document._id}/merge-requests/${mr.number}`} className="flex items-center gap-3 rounded-xl px-3 py-2.5 hover:bg-slate-50">
      <GitPullRequest className="h-4 w-4 shrink-0 text-emerald-600" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-slate-900">{mr.title}</p>
        <p className="truncate text-xs text-slate-500">!{mr.number} · {mr.document.title} · {mr.sourceBranchName} → {mr.targetBranchName}</p>
      </div>
      {mr.author?.name && <Avatar user={mr.author} size="xs" />}
      <span className="text-xs text-slate-400">{fromNow(mr.updatedAt)}</span>
    </Link>
  );
}

export function DashboardPage() {
  const { user } = useAuth();
  const [creating, setCreating] = useState(false);
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ['dashboard'], queryFn: () => http.get('/dashboard').then((r) => r.data) });

  return (
    <div className="container-page py-8">
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Hi {user.name.split(' ')[0]} 👋</h1>
          <p className="text-sm text-slate-500">Here's what's happening across your documents.</p>
        </div>
        <Button onClick={() => setCreating(true)}><FilePlus2 className="h-4 w-4" /> New document</Button>
      </div>

      {isLoading ? (
        <div className="grid gap-6 lg:grid-cols-3"><Skeleton className="h-72 lg:col-span-2" /><Skeleton className="h-72" /></div>
      ) : error ? (
        <ErrorState error={error} onRetry={refetch} />
      ) : (
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="space-y-6 lg:col-span-2">
            <section>
              <div className="mb-3 flex items-center justify-between">
                <h2 className="font-semibold text-slate-900">Recent documents</h2>
                <Link to="/documents" className="text-sm font-medium text-brand-600 hover:underline">View all</Link>
              </div>
              {data.recentDocs.length ? (
                <div className="grid gap-4 sm:grid-cols-2">{data.recentDocs.map((d) => <DocumentCard key={d._id} doc={d} />)}</div>
              ) : (
                <EmptyState title="No documents yet" message="Create one, or ask a teammate to invite you." action={<Button onClick={() => setCreating(true)}>Create a document</Button>} />
              )}
            </section>
            <section className="card p-5">
              <h2 className="mb-3 flex items-center gap-2 font-semibold text-slate-900"><ActivityIcon className="h-4 w-4" /> Recent activity</h2>
              {data.activity.length ? (
                <ul className="space-y-1">{data.activity.map((a) => <ActivityItem key={a._id} item={a} showDocument />)}</ul>
              ) : (
                <p className="text-sm text-slate-500">No activity yet.</p>
              )}
            </section>
          </div>
          <div className="space-y-6">
            <section className="card p-4">
              <h2 className="mb-2 flex items-center gap-2 px-2 font-semibold text-slate-900"><Eye className="h-4 w-4 text-amber-600" /> Waiting for your review</h2>
              {data.reviewRequests.length ? data.reviewRequests.map((mr) => <MrRow key={mr._id} mr={mr} />) : <p className="px-2 py-3 text-sm text-slate-500">You're all caught up.</p>}
            </section>
            <section className="card p-4">
              <h2 className="mb-2 flex items-center gap-2 px-2 font-semibold text-slate-900"><GitPullRequest className="h-4 w-4 text-emerald-600" /> Your open merge requests</h2>
              {data.myOpenMrs.length ? data.myOpenMrs.map((mr) => <MrRow key={mr._id} mr={mr} />) : <p className="px-2 py-3 text-sm text-slate-500">None open.</p>}
            </section>
          </div>
        </div>
      )}
      <NewDocumentDialog open={creating} onClose={() => setCreating(false)} />
    </div>
  );
}
