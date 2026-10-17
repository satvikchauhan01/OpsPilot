import { useStoredState } from '../hooks/useStoredState.js';

const supported = typeof window !== 'undefined' && 'Notification' in window;

// System notifications for urgent news while the console sits in a background tab. They are
// off until the person turns them on, and the browser asks for permission at that moment.
export function useBrowserNotifications() {
  const [wanted, setWanted] = useStoredState('opspilot-notifications', false);
  const enabled = supported && wanted && Notification.permission === 'granted';

  // Answers what happened, so the caller can explain a refusal.
  async function toggle() {
    if (!supported) return 'unsupported';
    if (enabled) {
      setWanted(false);
      return 'off';
    }
    const permission =
      Notification.permission === 'default' ? await Notification.requestPermission() : Notification.permission;
    if (permission !== 'granted') return 'blocked';
    setWanted(true);
    return 'on';
  }

  function show(toast, onOpen) {
    if (!enabled || !toast.urgent || !document.hidden) return;
    const notification = new Notification(toast.title, { body: toast.detail ?? '', tag: toast.key });
    notification.onclick = () => {
      window.focus();
      onOpen?.();
      notification.close();
    };
  }

  return { enabled, toggle, show };
}
