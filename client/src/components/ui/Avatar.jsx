import { cn } from '../../lib/cn';

export function Avatar({ user, size = 'md', className }) {
  const sizes = { xs: 'h-5 w-5 text-[10px]', sm: 'h-7 w-7 text-xs', md: 'h-9 w-9 text-sm', lg: 'h-12 w-12 text-base' };
  const initials = (user?.name || '?')
    .split(' ')
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
  return (
    <span
      title={user?.name}
      className={cn('inline-flex shrink-0 items-center justify-center rounded-full font-bold text-white ring-2 ring-white', sizes[size], className)}
      style={{ background: user?.avatarColor || '#6366f1' }}
    >
      {initials}
    </span>
  );
}

export function AvatarStack({ users = [], max = 4 }) {
  return (
    <div className="flex -space-x-2">
      {users.slice(0, max).map((u) => (
        <Avatar key={u._id || u.name} user={u} size="sm" />
      ))}
      {users.length > max && (
        <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-slate-200 text-xs font-semibold text-slate-600 ring-2 ring-white">
          +{users.length - max}
        </span>
      )}
    </div>
  );
}
