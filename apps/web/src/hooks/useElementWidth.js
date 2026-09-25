import { useCallback, useState } from 'react';

// Width of an element, kept current with a ResizeObserver. Returns [ref, width].
export function useElementWidth() {
  const [width, setWidth] = useState(0);

  const ref = useCallback((element) => {
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.floor(entry.contentRect.width)));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return [ref, width];
}
