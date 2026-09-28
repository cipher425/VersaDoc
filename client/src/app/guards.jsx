import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../features/auth/AuthContext';
import { PageLoader } from '../components/ui/Feedback';

/** UX only - the real protection is on the server for every request. */
export function RequireAuth() {
  const { status } = useAuth();
  const location = useLocation();
  if (status === 'loading') return <PageLoader />;
  if (status !== 'authenticated') return <Navigate to={`/login?next=${encodeURIComponent(location.pathname + location.search)}`} replace />;
  return <Outlet />;
}

export function GuestOnly() {
  const { status } = useAuth();
  if (status === 'loading') return <PageLoader />;
  if (status === 'authenticated') return <Navigate to="/dashboard" replace />;
  return <Outlet />;
}
