import { useOutletContext } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Database, GitCommitHorizontal, GitPullRequest, Users, Activity as ActivityIcon } from 'lucide-react';
import { http } from '../../lib/api';
import { ActivityItem } from './ActivityItem';
import { ErrorState, Skeleton } from '../../components/ui/Feedback';
import { StatCard } from '../../components/ui/Layout';
import { Avatar } from '../../components/ui/Avatar';
import { formatDate } from '../../lib/format';

const kb = (b) => (b > 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)} MB` : `${(b / 1024).toFixed(1)} KB`);

export function InsightsPage() {
  const { doc } = useOutletContext();
  const insights = useQuery({ queryKey: ['insights', doc._id], queryFn: () => http.get(`/documents/${doc._id}/insights`).then((r) => r.data) });
  const activity = useQuery({ queryKey: ['activity', doc._id], queryFn: () => http.get(`/documents/${doc._id}/activity`, { limit: 25 }).then((r) => r.data) });

  if (insights.isLoading) return <Skeleton className="h-96" />;
  if (insights.error) return <ErrorState error={insights.error} />;
  const { perDay, contributors, storage, mergeRequests } = insights.data;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Commits" value={storage.commits} hint={`${storage.snapshots} snapshots · ${storage.deltas} deltas`} icon={GitCommitHorizontal} />
        <StatCard label="Contributors" value={contributors.length} icon={Users} />
        <StatCard label="Merge requests" value={(mergeRequests.OPEN || 0) + (mergeRequests.MERGED || 0) + (mergeRequests.CLOSED || 0)} hint={`${mergeRequests.OPEN || 0} open · ${mergeRequests.MERGED || 0} merged`} icon={GitPullRequest} />
        <StatCard label="Storage saved by deltas" value={`${storage.savedPercent}%`} hint={`${kb(storage.storedBytes)} stored instead of ${kb(storage.fullBytes)}`} icon={Database} />
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="card p-5 xl:col-span-2">
          <h3 className="mb-4 text-sm font-semibold text-slate-900">Commits per day (last 90 days)</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={perDay}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="date" tickFormatter={(d) => formatDate(d).slice(0, 6)} tick={{ fontSize: 11 }} minTickGap={20} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} width={28} />
                <Tooltip labelFormatter={formatDate} />
                <Bar dataKey="commits" name="Commits" fill="#6366f1" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="card p-5">
          <h3 className="mb-3 text-sm font-semibold text-slate-900">Contributors</h3>
          <ul className="space-y-3">
            {contributors.map((c) => (
              <li key={c.user._id} className="flex items-center gap-3 text-sm">
                <Avatar user={c.user} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{c.user.name}</p>
                  <p className="text-xs text-slate-500">{c.commits} commits · <span className="text-emerald-600">+{c.additions}</span> <span className="text-red-600">-{c.deletions}</span></p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="card p-5">
        <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-900"><ActivityIcon className="h-4 w-4" /> Activity</h3>
        {activity.isLoading ? <Skeleton className="h-40" /> : <ul>{activity.data?.map((a) => <ActivityItem key={a._id} item={a} />)}</ul>}
      </div>
    </div>
  );
}
