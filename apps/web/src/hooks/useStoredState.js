import { useCallback, useState } from 'react';

function read(key, fallback) {
  try {
    const stored = localStorage.getItem(key);
    return stored === null ? fallback : JSON.parse(stored);
  } catch {
    return fallback;
  }
}

// useState that this browser remembers between visits. Storage can be unavailable (private
// windows, blocked site data); the value then simply lasts for the visit.
export function useStoredState(key, fallback) {
  const [value, setValue] = useState(() => read(key, fallback));

  const update = useCallback(
    (next) => {
      setValue((current) => {
        const resolved = typeof next === 'function' ? next(current) : next;
        try {
          localStorage.setItem(key, JSON.stringify(resolved));
        } catch {
          // remembered for this visit only
        }
        return resolved;
      });
    },
    [key],
  );

  return [value, update];
}
