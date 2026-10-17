import { createContext, useContext } from 'react';

// What the shell offers every page: the command palette, the shortcut help, the guided tour
// and toasts.
export const ConsoleContext = createContext(null);

export function useConsole() {
  return useContext(ConsoleContext);
}
