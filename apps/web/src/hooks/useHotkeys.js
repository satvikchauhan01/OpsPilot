import { useEffect, useEffectEvent } from 'react';

const SEQUENCE_TIMEOUT_MS = 900;

function isTyping(target) {
  return (
    target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))
  );
}

// Keyboard shortcuts. Keys are KeyboardEvent.key values; "g i" means g followed by i.
// Shortcuts stay quiet while the user is typing in a field or holding a modifier.
export function useHotkeys(bindings) {
  const run = useEffectEvent((combo, event) => {
    const handler = bindings[combo];
    if (!handler) return false;
    event.preventDefault();
    handler(event);
    return true;
  });
  const startsSequence = useEffectEvent((key) => Object.keys(bindings).some((combo) => combo.startsWith(`${key} `)));

  useEffect(() => {
    let pending = null;
    let timer = null;

    function onKeyDown(event) {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey || isTyping(event.target)) return;

      if (pending) {
        const combo = `${pending} ${event.key}`;
        pending = null;
        clearTimeout(timer);
        if (run(combo, event)) return;
      }
      if (run(event.key, event)) return;
      if (startsSequence(event.key)) {
        pending = event.key;
        timer = setTimeout(() => (pending = null), SEQUENCE_TIMEOUT_MS);
      }
    }

    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      clearTimeout(timer);
    };
  }, []);
}
