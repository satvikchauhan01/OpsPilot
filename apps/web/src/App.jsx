import { lazy, Suspense } from 'react';
import { Route, Routes } from 'react-router';
import { AuthProvider, RequireAuth } from './auth/AuthContext.jsx';
import { LoginPage } from './auth/LoginPage.jsx';
import { Shell } from './layout/Shell.jsx';
import { Loading } from './components/States.jsx';
import { OverviewPage } from './pages/OverviewPage.jsx';
import { IncidentsPage } from './pages/IncidentsPage.jsx';
import { IncidentPage } from './pages/IncidentPage.jsx';
import { AuditPage } from './pages/AuditPage.jsx';
import { DemoPage } from './pages/DemoPage.jsx';
import { NotFoundPage } from './pages/NotFoundPage.jsx';

// Pages most visits never open load on first use instead of with the app: the runbook
// reader brings a Markdown renderer, insights and the replay their charts, and the team
// page is for admins only.
function later(load, name, label) {
  const Page = lazy(() => load().then((module) => ({ default: module[name] })));
  return (
    <Suspense fallback={<Loading label={label} />}>
      <Page />
    </Suspense>
  );
}

const runbooks = later(() => import('./pages/RunbooksPage.jsx'), 'RunbooksPage', 'Loading runbooks');
const insights = later(() => import('./pages/InsightsPage.jsx'), 'InsightsPage', 'Loading insights');
const replay = later(() => import('./pages/ReplayPage.jsx'), 'ReplayPage', 'Loading the replay');
const team = later(() => import('./pages/TeamPage.jsx'), 'TeamPage', 'Loading the team');

export function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route
          element={
            <RequireAuth>
              <Shell />
            </RequireAuth>
          }
        >
          <Route index element={<OverviewPage />} />
          <Route path="incidents" element={<IncidentsPage />} />
          <Route path="incidents/:number" element={<IncidentPage />} />
          <Route path="incidents/:number/replay" element={replay} />
          <Route path="insights" element={insights} />
          <Route path="runbooks" element={runbooks} />
          <Route path="runbooks/:slug" element={runbooks} />
          <Route path="audit" element={<AuditPage />} />
          <Route path="team" element={team} />
          <Route path="demo" element={<DemoPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </AuthProvider>
  );
}
