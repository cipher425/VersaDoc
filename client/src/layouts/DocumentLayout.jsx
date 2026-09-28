import { NavLink, Outlet, useParams } from 'react-router-dom';
import { BarChart3, GitBranch, GitPullRequest, History, PenLine, Settings, Globe, Lock } from 'lucide-react';
import { useDocument } from '../features/documents/api';
import { ErrorState, PageLoader, StatusBadge } from '../components/ui/Feedback';
import { AvatarStack } from '../components/ui/Avatar';
import { roleCan } from '../lib/format';
import { cn } from '../lib/cn';

/** Loads the document once; every tab reads it through useOutletContext(). */
export function DocumentLayout() {
  const { docId } = useParams();
  const { data: doc, isLoading, error, refetch } = useDocument(docId);
  if (isLoading) return <PageLoader />;
  if (error) return <div className="container-page py-12"><ErrorState error={error} onRetry={refetch} /></div>;

  const can = (action) => roleCan(doc.myRole, action);
  const tabs = [
    { to: '', label: 'Editor', icon: PenLine, end: true },
    { to: 'history', label: 'History', icon: History },
    { to: 'branches', label: 'Branches', icon: GitBranch, count: doc.branchCount },
    { to: 'merge-requests', label: 'Merge requests', icon: GitPullRequest, count: doc.openMergeRequests },
    { to: 'insights', label: 'Insights', icon: BarChart3 },
    ...(can('manage') ? [{ to: 'settings', label: 'Settings', icon: Settings }] : []),
  ];

  return (
    <div>
      <div className="border-b border-slate-200 bg-white">
        <div className="container-page pt-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                {doc.visibility === 'public' ? <Globe className="h-4 w-4 text-emerald-600" /> : <Lock className="h-4 w-4 text-slate-400" />}
                <span className="text-sm text-slate-500">{doc.owner?.name} /</span>
                <h1 className="truncate text-xl font-bold text-slate-900">{doc.title}</h1>
                <StatusBadge status={doc.myRole} />
              </div>
              {doc.description && <p className="mt-1 max-w-3xl text-sm text-slate-500">{doc.description}</p>}
            </div>
            <AvatarStack users={[doc.owner, ...doc.collaborators.map((c) => c.user)].filter(Boolean)} />
          </div>
          <nav className="scrollbar-none -mb-px mt-4 flex gap-1 overflow-x-auto">
            {tabs.map(({ to, label, icon: Icon, end, count }) => (
              <NavLink
                key={label}
                to={to}
                end={end}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium transition',
                    isActive ? 'border-brand-600 text-slate-900' : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-800'
                  )
                }
              >
                <Icon className="h-4 w-4" />
                {label}
                {count > 0 && <span className="rounded-full bg-slate-100 px-1.5 text-xs text-slate-600">{count}</span>}
              </NavLink>
            ))}
          </nav>
        </div>
      </div>
      <div className="container-page py-6">
        <Outlet context={{ doc, can, refetchDoc: refetch }} />
      </div>
    </div>
  );
}
