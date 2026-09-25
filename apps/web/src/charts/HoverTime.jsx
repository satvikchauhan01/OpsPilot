import { createContext, useContext, useMemo, useState } from 'react';

// A moment in time shared by everything on the incident page. Hovering a chart or a
// timeline entry sets it, and every chart draws its crosshair at the same instant.
const HoverTimeContext = createContext({ time: null, setTime: () => {} });

export function HoverTimeProvider({ children }) {
  const [time, setTime] = useState(null);
  const value = useMemo(() => ({ time, setTime }), [time]);
  return <HoverTimeContext.Provider value={value}>{children}</HoverTimeContext.Provider>;
}

export function useHoverTime() {
  return useContext(HoverTimeContext);
}
