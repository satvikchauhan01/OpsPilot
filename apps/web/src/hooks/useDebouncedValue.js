import { useEffect, useState } from 'react';

// The value, once it has stopped changing for `delayMs`. Keeps a search box from sending a
// request on every keystroke.
export function useDebouncedValue(value, delayMs) {
  const [settled, setSettled] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return settled;
}
