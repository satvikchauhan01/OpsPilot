import { createContext, useContext } from 'react';
import { Navigate, useLocation } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api.js';
import { FullPageMessage } from '../components/States.jsx';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const queryClient = useQueryClient();
  const session = useQuery({
    queryKey: ['me'],
    queryFn: async () => {
      try {
        return (await api.me()).user;
      } catch (err) {
        if (err.status === 401) return null;
        throw err;
      }
    },
    staleTime: Infinity,
  });

  async function login(email, password) {
    const { user } = await api.login(email, password);
    queryClient.setQueryData(['me'], user);
  }

  async function logout() {
    await api.logout();
    queryClient.clear();
    queryClient.setQueryData(['me'], null);
  }

  const value = { user: session.data ?? null, loading: session.isPending, error: session.error, login, logout };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}

// Responders and admins can change incidents; viewers can only look.
export function canRespond(user) {
  return user?.role === 'responder' || user?.role === 'admin';
}

export function RequireAuth({ children }) {
  const { user, loading, error } = useAuth();
  const location = useLocation();

  if (loading) return <FullPageMessage title="Connecting to OpsPilot" busy />;
  if (error) return <FullPageMessage title="Can't reach the OpsPilot server" detail={error.message} />;
  if (!user) return <Navigate to="/login" replace state={{ from: location }} />;
  return children;
}
