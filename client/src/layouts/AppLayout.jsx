import { useState } from 'react';
import { Link, NavLink, Outlet } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Bell, ChevronDown, FileText, LayoutDashboard, LogOut, User } from 'lucide-react';
import { useAuth } from '../features/auth/AuthContext';
import { Avatar } from '../components/ui/Avatar';
import { http } from '../lib/api';
import { cn } from '../lib/cn';

function NotificationBell() {
  const { data } = useQuery({
    queryKey: ['notifications', 'unread'],
    queryFn: () => http.get('/notifications/unread-count').then((r) => r.data.count),
    refetchInterval: 60_000,
  });
  return (
    <Link to="/notifications" className="relative rounded-full p-2 text-slate-600 hover:bg-slate-100" aria-label="Notifications">
      <Bell className="h-5 w-5" />
      {data > 0 && (
        <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-brand-600 px-1 text-[10px] font-bold text-white">
          {data > 9 ? '9+' : data}
        </span>
      )}
    </Link>
  );
}

function UserMenu() {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const item = 'flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-700 hover:bg-slate-100';
  return (
    <div className="relative">
      <button onClick={() => setOpen((o) => !o)} className="flex items-center gap-1.5 rounded-full py-1 pl-1 pr-2 hover:bg-slate-100">
        <Avatar user={user} size="sm" />
        <ChevronDown className="h-4 w-4 text-slate-400" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-40 mt-2 w-56 rounded-2xl border border-slate-200 bg-white p-2 shadow-xl" onClick={() => setOpen(false)}>
            <div className="border-b border-slate-100 px-3 pb-2 pt-1">
              <p className="truncate text-sm font-semibold">{user.name}</p>
              <p className="truncate text-xs text-slate-500">{user.email}</p>
            </div>
            <Link to="/profile" className={item}><User className="h-4 w-4" /> Profile</Link>
            <button onClick={logout} className={cn(item, 'text-red-600')}><LogOut className="h-4 w-4" /> Log out</button>
          </div>
        </>
      )}
    </div>
  );
}

const navClass = ({ isActive }) =>
  cn('flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium', isActive ? 'bg-brand-50 text-brand-700' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900');

export function AppLayout() {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="container-page flex h-14 items-center gap-3">
          <Link to="/dashboard" className="mr-2 flex items-center gap-2 text-lg font-extrabold tracking-tight text-slate-900">
            <img src="/favicon.svg" alt="" className="h-7 w-7" />
            <span className="hidden sm:inline">Versa<span className="text-brand-600">Doc</span></span>
          </Link>
          <nav className="flex items-center gap-1">
            <NavLink to="/dashboard" className={navClass}><LayoutDashboard className="h-4 w-4" /><span className="hidden sm:inline">Dashboard</span></NavLink>
            <NavLink to="/documents" className={navClass}><FileText className="h-4 w-4" /><span className="hidden sm:inline">Documents</span></NavLink>
          </nav>
          <div className="ml-auto flex items-center gap-1">
            <NotificationBell />
            <UserMenu />
          </div>
        </div>
      </header>
      <main className="flex-1">
        <Outlet />
      </main>
    </div>
  );
}
