import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { lazy, Suspense, useLayoutEffect, type ReactElement } from 'react';
import type { Me, WebsiteRole } from '@weekly-meeting/shared';
import { useTranslation } from 'react-i18next';
import { BrowserRouter, Navigate, Route, Routes, useLocation, useNavigationType } from 'react-router';
import { BlueAlert, BlueButton, BlueCard, BlueSpinner } from '../components/blue';
import { useMe } from '../features/auth/useAuth';
import { HomePage } from '../pages/HomePage';
import { LoginPage } from '../pages/LoginPage';
import { MeetingPage } from '../pages/MeetingPage';
import { NotesPage } from '../pages/NotesPage';
import { PeriodPage } from '../pages/PeriodPage';
import { PeriodProjectPage } from '../pages/PeriodProjectPage';
import { ProjectPage } from '../pages/ProjectPage';
import { ProjectsPage } from '../pages/ProjectsPage';
import { TeamPage } from '../pages/TeamPage';
import { TeamsPage } from '../pages/TeamsPage';
import { UsersPage } from '../pages/UsersPage';
import { WaitingPage } from '../pages/WaitingPage';
import { ApiFailure } from '../services/api';
import { errorLabel } from '../utils/errorLabels';

// The note editor (Tiptap and ProseMirror) is most of the code: it loads only when a note is opened.
const NotePage = lazy(() => import('../pages/NotePage').then((m) => ({ default: m.NotePage })));

const pageLoading = (
  <main className="center-page">
    <BlueSpinner size="lg" />
  </main>
);

const queryClient = new QueryClient({ defaultOptions: { queries: { refetchOnWindowFocus: true } } });

type Place = 'guest' | 'inactive' | 'active';
const HOME: Record<Place, string> = { guest: '/login', inactive: '/waiting', active: '/' };

/**
 * Shows a page only to the kind of visitor it is for, and sends everyone else to their own page. `role` limits
 * a page to the role in use (Admin: Home and Users; User: Home and Teams); others go Home before any request.
 * This is navigation only: the backend enforces every rule again on each request.
 */
function Gate({ place, role, render }: { place: Place; role?: WebsiteRole; render: (user: Me | null) => ReactElement }) {
  const { t } = useTranslation();
  const me = useMe();
  if (me.isPending) {
    return (
      <main className="center-page">
        <BlueSpinner size="lg" />
      </main>
    );
  }
  if (me.isError) {
    const code = me.error instanceof ApiFailure ? me.error.code : 'unknown_error';
    return (
      <main className="center-page">
        <BlueCard>
          <div className="stack">
            <BlueAlert variant="error">{errorLabel(code)}</BlueAlert>
            <BlueButton onClick={() => void me.refetch()}>{t('common.tryAgain')}</BlueButton>
          </div>
        </BlueCard>
      </main>
    );
  }
  const user = me.data;
  const where: Place = !user ? 'guest' : user.status === 'active' ? 'active' : 'inactive';
  if (where !== place) return <Navigate to={HOME[where]} replace />;
  if (role && user?.activeRole !== role) return <Navigate to="/" replace />;
  return render(user);
}

/**
 * A new page starts at its top: without this the browser keeps the last page's scroll, so going to the next quarter
 * from far down its notes would open the next one halfway down. Back and Forward keep their place, changes within
 * a page (filters, tabs) do not move it, and an address with a place in the page (#read-…) is left to that page.
 */
function ScrollToTop() {
  const { pathname, hash } = useLocation();
  const navigation = useNavigationType();
  useLayoutEffect(() => {
    if (navigation !== 'POP' && !hash) window.scrollTo(0, 0);
    // Only a new page counts; the navigation type and the hash are read from the same render.
  }, [pathname]);
  return null;
}

export function App() {
  // A new language draws everything again in place (no remount: a note being written keeps its text).
  useTranslation();
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <ScrollToTop />
        <Routes>
          <Route path="/login" element={<Gate place="guest" render={() => <LoginPage />} />} />
          <Route path="/waiting" element={<Gate place="inactive" render={(user) => <WaitingPage user={user as Me} />} />} />
          <Route path="/" element={<Gate place="active" render={(user) => <HomePage user={user as Me} />} />} />
          <Route path="/notes" element={<Gate place="active" role="user" render={(user) => <NotesPage user={user as Me} />} />} />
          <Route path="/projects" element={<Gate place="active" role="user" render={(user) => <ProjectsPage user={user as Me} />} />} />
          <Route path="/projects/:id" element={<Gate place="active" role="user" render={(user) => <ProjectPage user={user as Me} />} />} />
          <Route
            path="/notes/:id"
            element={
              <Gate
                place="active"
                role="user"
                render={(user) => (
                  <Suspense fallback={pageLoading}>
                    <NotePage user={user as Me} />
                  </Suspense>
                )}
              />
            }
          />
          <Route path="/teams" element={<Gate place="active" role="user" render={(user) => <TeamsPage user={user as Me} />} />} />
          <Route path="/teams/:id" element={<Gate place="active" role="user" render={(user) => <TeamPage user={user as Me} />} />} />
          <Route
            path="/teams/:id/periods/:key"
            element={<Gate place="active" role="user" render={(user) => <PeriodPage user={user as Me} />} />}
          />
          <Route
            path="/teams/:id/periods/:key/projects/:projectId"
            element={<Gate place="active" role="user" render={(user) => <PeriodProjectPage user={user as Me} />} />}
          />
          <Route path="/meetings/:id" element={<Gate place="active" role="user" render={(user) => <MeetingPage user={user as Me} />} />} />
          <Route path="/users" element={<Gate place="active" role="admin" render={(user) => <UsersPage user={user as Me} />} />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
