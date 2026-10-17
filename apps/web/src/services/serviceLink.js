import { useCallback } from 'react';
import { useLocation } from 'react-router';

// A service's detail panel opens on top of whatever page you are on, from `?service=` in the
// address, so it can be linked to and Back closes it.
export function useServiceLink() {
  const location = useLocation();
  return useCallback(
    (name) => {
      const params = new URLSearchParams(location.search);
      params.set('service', name);
      return { pathname: location.pathname, search: `?${params}`, hash: location.hash };
    },
    [location],
  );
}
