import { Route, Routes } from 'react-router';
import { AuthProvider, RequireAuth } from './auth/AuthContext.jsx';
import { LoginPage } from './auth/LoginPage.jsx';
import { Shell } from './layout/Shell.jsx';
import { OverviewPage } from './pages/OverviewPage.jsx';
import { IncidentsPage } from './pages/IncidentsPage.jsx';
import { IncidentPage } from './pages/IncidentPage.jsx';
import { NotFoundPage } from './pages/NotFoundPage.jsx';

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
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </AuthProvider>
  );
}
