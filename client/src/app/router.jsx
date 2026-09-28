import { createBrowserRouter } from 'react-router-dom';
import { RequireAuth, GuestOnly } from './guards';
import { AppLayout } from '../layouts/AppLayout';
import { DocumentLayout } from '../layouts/DocumentLayout';
import { LandingPage } from '../features/landing/LandingPage';
import { LoginPage, RegisterPage } from '../features/auth/AuthPages';
import { DashboardPage } from '../features/dashboard/DashboardPage';
import { DocumentsPage } from '../features/documents/DocumentsPage';
import { SettingsPage } from '../features/documents/SettingsPage';
import { EditorPage } from '../features/editor/EditorPage';
import { HistoryPage, CommitPage, ComparePage, BlamePage } from '../features/history/HistoryPages';
import { BranchesPage } from '../features/branches/BranchesPage';
import { MergeRequestsPage, NewMergeRequestPage } from '../features/reviews/MergeRequestsPage';
import { MergeRequestPage } from '../features/reviews/MergeRequestPage';
import { InsightsPage } from '../features/insights/InsightsPage';
import { NotificationsPage, ProfilePage } from '../features/account/AccountPages';
import { PublicDocPage } from '../features/public/PublicDocPage';
import { EmptyState } from '../components/ui/Feedback';
import { Button } from '../components/ui/Button';

function NotFound() {
  return (
    <div className="container-page py-20">
      <EmptyState title="Page not found" message="This page doesn't exist." action={<Button to="/">Go home</Button>} />
    </div>
  );
}

export const router = createBrowserRouter([
  { path: '/', element: <LandingPage /> },
  { path: '/p/:slug', element: <PublicDocPage /> },
  {
    element: <GuestOnly />,
    children: [
      { path: '/login', element: <LoginPage /> },
      { path: '/register', element: <RegisterPage /> },
    ],
  },
  {
    element: <RequireAuth />,
    children: [
      {
        element: <AppLayout />,
        children: [
          { path: '/dashboard', element: <DashboardPage /> },
          { path: '/documents', element: <DocumentsPage /> },
          { path: '/notifications', element: <NotificationsPage /> },
          { path: '/profile', element: <ProfilePage /> },
          {
            path: '/d/:docId',
            element: <DocumentLayout />,
            children: [
              { index: true, element: <EditorPage /> },
              { path: 'history', element: <HistoryPage /> },
              { path: 'commits/:commitId', element: <CommitPage /> },
              { path: 'compare', element: <ComparePage /> },
              { path: 'blame', element: <BlamePage /> },
              { path: 'branches', element: <BranchesPage /> },
              { path: 'merge-requests', element: <MergeRequestsPage /> },
              { path: 'merge-requests/new', element: <NewMergeRequestPage /> },
              { path: 'merge-requests/:number', element: <MergeRequestPage /> },
              { path: 'insights', element: <InsightsPage /> },
              { path: 'settings', element: <SettingsPage /> },
            ],
          },
          { path: '*', element: <NotFound /> },
        ],
      },
    ],
  },
]);
