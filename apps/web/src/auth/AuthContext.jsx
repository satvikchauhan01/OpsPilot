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

  async function loginAsGuest() {
    const { user } = await api.guest();
    queryClient.setQueryData(['me'], user);
  }

  // Signed out first, then everything the previous user could see is dropped. Clearing the
  // whole cache instead would also drop the query this provider watches, and it would never
  // hear that nobody is signed in any more.
  async function logout() {
    await api.logout();
    queryClient.setQueryData(['me'], null);
    queryClient.removeQueries({ predicate: (query) => query.queryKey[0] !== 'me' });
  }

  const value = {
    user: session.data ?? null,
    loading: session.isPending,
    error: session.error,
    login,
    loginAsGuest,
    logout,
  };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}

// Responders and admins can change incidents, and so can guests, since everything a guest
// can reach is the demo shop. Viewers can only look.
export function canRespond(user) {
  return ['responder', 'admin', 'guest'].includes(user?.role);
}

// Postmortems speak for the team and a demo reset cuts short someone else's scenario, so
// those stay with the team's own responders.
export function isResponder(user) {
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
