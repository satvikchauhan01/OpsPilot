import { useCallback, useState } from 'react';

const STORAGE_KEY = 'opspilot-theme';

// public/theme.js picks the initial theme before React loads. This hook only switches it.
export function useTheme() {
  const [theme, setTheme] = useState(() => document.documentElement.dataset.theme ?? 'dark');

  const toggle = useCallback(() => {
    setTheme((current) => {
      const next = current === 'dark' ? 'light' : 'dark';
      document.documentElement.dataset.theme = next;
      try {
        localStorage.setItem(STORAGE_KEY, next);
      } catch {
        // not remembered across visits, but the switch itself still works
      }
      return next;
    });
  }, []);

  return { theme, toggle };
}
