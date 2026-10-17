import { useState } from 'react';
import { Navigate, useLocation } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api.js';
import { useAuth } from './AuthContext.jsx';
import { BrandMark } from '../components/BrandMark.jsx';
import styles from './LoginPage.module.css';

export function LoginPage() {
  const { user, login, loginAsGuest } = useAuth();
  const options = useQuery({ queryKey: ['auth-options'], queryFn: api.authOptions, staleTime: Infinity });
  const location = useLocation();
  const [error, setError] = useState(null);
  const [pending, setPending] = useState(false);
  const [next, setNext] = useState(null);

  const destination = next ?? location.state?.from?.pathname ?? '/';
  if (user) return <Navigate to={destination} replace />;

  // A successful sign-in re-renders this page with a user, and the redirect above takes over.
  // Guests start on the demo page.
  async function signIn(attempt, then = null) {
    setNext(then);
    setPending(true);
    setError(null);
    try {
      await attempt();
    } catch (err) {
      setError(err.message);
    } finally {
      setPending(false);
    }
  }

  function handleSubmit(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    signIn(() => login(form.get('email'), form.get('password')));
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

        {options.data?.guests && (
          <div className={styles.guest}>
            <span className={styles.or}>or</span>
            <button
              type="button"
              className={styles.guestButton}
              disabled={pending}
              onClick={() => signIn(loginAsGuest, '/demo')}
            >
              Try the demo as a guest
            </button>
            <p className={styles.guestNote}>
              No account needed. Break the demo shop and watch OpsPilot work the incident. A guest session lasts 2
              hours.
            </p>
          </div>
        )}
      </section>

      <SignalTrace />
    </main>
  );
}

// The story of one incident on one error-rate line, numbered where OpsPilot steps in.
const STORY = [
  { x: 236, y: 200, text: 'checkout 1.4.2 is deployed' },
  { x: 256, y: 140, text: 'the error rate crosses its limit and an alert fires' },
  { x: 296, y: 80, text: 'the AI finds the bad deploy, citing logs, metrics and the change' },
  { x: 334, y: 74, text: 'a person approves the rollback it proposes' },
  { x: 378, y: 200, text: 'OpsPilot checks the metrics recover, then drafts the postmortem' },
];

// The other side of the page: what OpsPilot is, in one picture.
function SignalTrace() {
  return (
    <section className={styles.story} aria-labelledby="story-title">
      <p className={styles.kicker}>AI incident response for Kubernetes</p>
      <h2 id="story-title" className={styles.storyTitle}>
        Find what broke. Fix it with a person in the loop.
      </h2>
      <p className={styles.storyLede}>
        OpsPilot watches a real shop running on Kubernetes, groups its alerts into incidents, has an AI agent work out
        the root cause with evidence for every claim, and runs a fix only after someone approves it.
      </p>

      <div className={styles.trace} aria-hidden="true">
        <svg viewBox="0 0 600 240">
          <line x1="0" y1="210" x2="600" y2="210" className={styles.baseline} />
          <line x1="0" y1="140" x2="600" y2="140" className={styles.threshold} />
          <text x="600" y="132" className={styles.axisLabel}>
            alert limit
          </text>
          <path
            className={styles.line}
            pathLength="1"
            d="M0 206 L60 205 L110 207 L160 204 L210 206 L236 200 L256 140 L274 70 L296 80 L314 66 L334 74 L352 150 L378 200 L420 205 L470 203 L520 206 L600 205"
          />
          {STORY.map((point, index) => (
            <g key={point.text} className={styles.point} style={{ animationDelay: `${0.5 + index * 0.35}s` }}>
              <circle cx={point.x} cy={point.y} r="10" />
              <text x={point.x} y={point.y} dy="0.35em">
                {index + 1}
              </text>
            </g>
          ))}
        </svg>
      </div>
      <ol className={styles.steps}>
        {STORY.map((point) => (
          <li key={point.text}>{point.text}</li>
        ))}
      </ol>
    </section>
  );
}
