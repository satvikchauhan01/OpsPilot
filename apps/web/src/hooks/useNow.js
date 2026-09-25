import { useEffect, useState } from 'react';

// Current time that re-renders the caller every `intervalMs`, for live durations and "x min ago".
export function useNow(intervalMs = 1000) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);

  return now;
}
