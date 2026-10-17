import { useCallback, useSyncExternalStore } from 'react';

// Whether a CSS media query matches, kept up to date as the window or the system changes.
export function useMediaQuery(query) {
  const subscribe = useCallback(
    (onChange) => {
      const list = window.matchMedia(query);
      list.addEventListener('change', onChange);
      return () => list.removeEventListener('change', onChange);
    },
    [query],
  );
  return useSyncExternalStore(subscribe, () => window.matchMedia(query).matches);
}

// True when the visitor asked their system for less motion. Animation that carries no
// information (moving traffic, the replay playing by itself) stays still then.
export function useReducedMotion() {
  return useMediaQuery('(prefers-reduced-motion: reduce)');
}
