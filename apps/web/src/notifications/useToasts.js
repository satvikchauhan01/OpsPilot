import { useCallback, useRef, useState } from 'react';

const VISIBLE = 4;
// Keys already shown, kept bounded: news older than this many keys won't come back anyway.
const REMEMBERED = 300;

// The toast stack. A toast with a `key` already shown is dropped, so news repeated by later
// updates appears once.
export function useToasts() {
  const [toasts, setToasts] = useState([]);
  const shown = useRef(new Set());
  const nextId = useRef(0);

  const push = useCallback((toast) => {
    if (toast.key) {
      if (shown.current.has(toast.key)) return false;
      shown.current.add(toast.key);
      if (shown.current.size > REMEMBERED) shown.current.delete(shown.current.values().next().value);
    }
    nextId.current += 1;
    const id = nextId.current;
    setToasts((current) => [...current, { ...toast, id }].slice(-VISIBLE));
    return true;
  }, []);

  const dismiss = useCallback((id) => setToasts((current) => current.filter((toast) => toast.id !== id)), []);

  return { toasts, push, dismiss };
}
