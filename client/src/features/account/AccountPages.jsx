import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { Bell, CheckCheck } from 'lucide-react';
import { http } from '../../lib/api';
import { useAuth } from '../auth/AuthContext';
import { Button } from '../../components/ui/Button';
import { Field, Input, Textarea } from '../../components/ui/Form';
import { EmptyState, ErrorState, Skeleton } from '../../components/ui/Feedback';
import { PageHeader, Pagination } from '../../components/ui/Layout';
import { Avatar } from '../../components/ui/Avatar';
import { fromNow } from '../../lib/format';
import { cn } from '../../lib/cn';

export function NotificationsPage() {
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const { data, isLoading, error } = useQuery({ queryKey: ['notifications', 'list', page], queryFn: () => http.get('/notifications', { page, limit: 20 }) });
  const invalidate = () => qc.invalidateQueries({ queryKey: ['notifications'] });

  return (
    <div className="container-page max-w-3xl py-8">
      <PageHeader
        title="Notifications"
        subtitle="Review requests, approvals, merges and comments."
        actions={data?.meta?.unread > 0 && <Button size="sm" variant="secondary" onClick={() => http.post('/notifications/read-all').then(invalidate)}><CheckCheck className="h-4 w-4" /> Mark all read</Button>}
      />
      {isLoading ? (
        <Skeleton className="h-64" />
      ) : error ? (
        <ErrorState error={error} />
      ) : !data.data.length ? (
        <EmptyState icon={Bell} title="You're all caught up" />
      ) : (
        <div className="card divide-y divide-slate-100">
          {data.data.map((n) => (
            <Link key={n._id} to={n.link || '#'} onClick={() => !n.readAt && http.patch(`/notifications/${n._id}/read`).then(invalidate)} className={cn('flex gap-3 p-4 hover:bg-slate-50', !n.readAt && 'bg-brand-50/40')}>
              <span className={cn('mt-1.5 h-2 w-2 shrink-0 rounded-full', n.readAt ? 'bg-transparent' : 'bg-brand-600')} />
              <div>
                <p className="text-sm font-semibold text-slate-900">{n.title}</p>
                {n.body && <p className="text-sm text-slate-600">{n.body}</p>}
                <p className="mt-1 text-xs text-slate-400">{fromNow(n.createdAt)}</p>
              </div>
            </Link>
          ))}
        </div>
      )}
      <Pagination meta={data?.meta} onPage={setPage} />
    </div>
  );
}

export function ProfilePage() {
  const { user, reloadUser } = useAuth();
  const profile = useForm({ defaultValues: { name: user.name, bio: user.bio || '' } });
  const password = useForm({ defaultValues: { currentPassword: '', newPassword: '' } });
  return (
    <div className="container-page max-w-3xl py-8">
      <div className="mb-6 flex items-center gap-4">
        <Avatar user={user} size="lg" />
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{user.name}</h1>
          <p className="text-sm text-slate-500">{user.email}</p>
        </div>
      </div>
      <div className="grid gap-6 md:grid-cols-2">
        <form
          className="card space-y-4 p-5"
          onSubmit={profile.handleSubmit(async (v) => {
            try {
              await http.patch('/users/me', v);
              await reloadUser();
              toast.success('Profile updated');
            } catch (err) {
              toast.error(err.message);
            }
          })}
        >
          <h2 className="font-semibold">Profile</h2>
          <Field label="Name"><Input {...profile.register('name', { required: true, minLength: 2 })} /></Field>
          <Field label="Bio"><Textarea rows={3} {...profile.register('bio')} /></Field>
          <Button type="submit" loading={profile.formState.isSubmitting}>Save</Button>
        </form>
        <form
          className="card space-y-4 p-5"
          onSubmit={password.handleSubmit(async (v) => {
            try {
              await http.patch('/users/me/password', v);
              password.reset();
              toast.success('Password changed. Other devices were logged out.');
            } catch (err) {
              toast.error(err.details?.[0]?.message || err.message);
            }
          })}
        >
          <h2 className="font-semibold">Change password</h2>
          <Field label="Current password"><Input type="password" {...password.register('currentPassword')} /></Field>
          <Field label="New password" hint="8+ characters with a letter and a number"><Input type="password" {...password.register('newPassword')} /></Field>
          <Button type="submit" variant="dark" loading={password.formState.isSubmitting}>Update password</Button>
        </form>
      </div>
    </div>
  );
}
