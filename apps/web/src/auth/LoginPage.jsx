import { useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router';
import { useAuth } from './AuthContext.jsx';
import { BrandMark } from '../components/BrandMark.jsx';
import styles from './LoginPage.module.css';

export function LoginPage() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [error, setError] = useState(null);
  const [pending, setPending] = useState(false);

  const destination = location.state?.from?.pathname ?? '/';
  if (user) return <Navigate to={destination} replace />;

  async function handleSubmit(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setPending(true);
    setError(null);
    try {
      await login(form.get('email'), form.get('password'));
      navigate(destination, { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setPending(false);
    }
  }

  return (
    <main className={styles.page}>
      <section className={styles.panel} aria-labelledby="login-title">
        <header className={styles.header}>
          <BrandMark />
          <span className="caption">Incident console</span>
        </header>

        <h1 id="login-title" className={styles.title}>
          Sign in
        </h1>
        <p className={styles.lede}>Alerts, context and fixes for the shop cluster, in one place.</p>

        <form className={styles.form} onSubmit={handleSubmit}>
          <label className={styles.field}>
            <span className="caption">Email</span>
            <input name="email" type="email" autoComplete="username" required autoFocus />
          </label>
          <label className={styles.field}>
            <span className="caption">Password</span>
            <input name="password" type="password" autoComplete="current-password" required />
          </label>

          {error && (
            <p className={styles.error} role="alert">
              {error}
            </p>
          )}

          <button className={styles.submit} type="submit" disabled={pending}>
            {pending ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </section>

      <SignalTrace />
    </main>
  );
}

// The decorative side of the page: an error-rate trace that spikes and recovers,
// which is the whole product in one line.
function SignalTrace() {
  return (
    <div className={styles.trace} aria-hidden="true">
      <svg viewBox="0 0 600 240">
        <line x1="0" y1="200" x2="600" y2="200" className={styles.baseline} />
        <line x1="0" y1="140" x2="600" y2="140" className={styles.threshold} />
        <path
          className={styles.line}
          pathLength="1"
          d="M0 196 L60 195 L110 197 L160 194 L210 196 L240 190 L262 120 L280 60 L300 72 L318 58 L338 66 L352 150 L372 188 L420 194 L470 192 L520 195 L600 194"
        />
        <circle cx="262" cy="120" r="5" className={styles.marker} />
      </svg>
      <div className={styles.traceLabels}>
        <span className="caption">checkout · error rate</span>
        <span className="caption">deploy 1.4.2 → alert → rollback → recovered</span>
      </div>
    </div>
  );
}
