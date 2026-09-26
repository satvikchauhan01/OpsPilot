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
import { NotFoundPage } from './pages/NotFoundPage.jsx';

// The runbook reader brings a Markdown renderer that no other page needs, so it loads on
// first visit instead of with the rest of the app.
const RunbooksPage = lazy(() =>
  import('./pages/RunbooksPage.jsx').then((module) => ({ default: module.RunbooksPage })),
);

export function App() {
  const runbooks = (
    <Suspense fallback={<Loading label="Loading runbooks" />}>
      <RunbooksPage />
    </Suspense>
  );

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
          <Route path="runbooks" element={runbooks} />
          <Route path="runbooks/:slug" element={runbooks} />
          <Route path="audit" element={<AuditPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </AuthProvider>
  );
}
