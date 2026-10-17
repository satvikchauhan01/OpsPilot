import { useEffect, useEffectEvent, useRef, useState } from 'react';
import { Link } from 'react-router';
import { ToneMark } from '../components/Tags.jsx';
import { ArrowRightIcon, CloseIcon } from '../components/Icons.jsx';
import styles from './Toaster.module.css';

const DURATION_MS = 7000;
const URGENT_DURATION_MS = 15_000;

export function Toaster({ toasts, onDismiss }) {
  return (
    <section className={styles.region} aria-label="Notifications" aria-live="polite">
      {toasts.map((toast) => (
        <Toast key={toast.id} toast={toast} onDismiss={onDismiss} />
      ))}
    </section>
  );
}

// A toast leaves on its own after a while. Pointing at it or focusing inside it holds it,
// so there is time to read it and follow its link.
function Toast({ toast, onDismiss }) {
  const [held, setHeld] = useState(false);
  const duration = toast.duration ?? (toast.urgent ? URGENT_DURATION_MS : DURATION_MS);
  const remaining = useRef(duration);
  const dismiss = useEffectEvent(() => onDismiss(toast.id));

  useEffect(() => {
    if (held) return;
    const started = Date.now();
    const timer = setTimeout(dismiss, remaining.current);
    return () => {
      clearTimeout(timer);
      remaining.current -= Date.now() - started;
    };
  }, [held]);

  return (
    <article
      className={styles.toast}
      data-tone={toast.tone}
      data-held={held || undefined}
      style={{ '--duration': `${duration}ms` }}
      onPointerEnter={() => setHeld(true)}
      onPointerLeave={() => setHeld(false)}
      onFocus={() => setHeld(true)}
      onBlur={() => setHeld(false)}
    >
      <ToneMark tone={toast.tone} />
      <div className={styles.body}>
        <p className={styles.title}>{toast.title}</p>
        {toast.detail && <p className={styles.detail}>{toast.detail}</p>}
        {toast.link && (
          <Link to={toast.link.to} className={styles.link} onClick={() => onDismiss(toast.id)}>
            Open {toast.link.label}
            <ArrowRightIcon size={14} />
          </Link>
        )}
      </div>
      <button type="button" className={styles.close} onClick={() => onDismiss(toast.id)}>
        <CloseIcon label="Dismiss" size={14} />
      </button>
      <span className={styles.timer} aria-hidden="true" />
    </article>
  );
}
