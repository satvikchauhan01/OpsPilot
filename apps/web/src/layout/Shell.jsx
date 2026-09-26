import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router';
import { useAuth } from '../auth/AuthContext.jsx';
import { useTheme } from '../hooks/useTheme.js';
import { useHotkeys } from '../hooks/useHotkeys.js';
import { useLiveUpdates } from '../hooks/useLiveUpdates.js';
import { BrandMark } from '../components/BrandMark.jsx';
import { SeverityTag } from '../components/Tags.jsx';
import { ArrowRightIcon, CloseIcon, KeyboardIcon, MoonIcon, SunIcon } from '../components/Icons.jsx';
import { incidentId } from '../lib/format.js';
import { ShortcutHelp } from './ShortcutHelp.jsx';
import styles from './Shell.module.css';

const ANNOUNCEMENT_MS = 30_000;

export function Shell() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const { theme, toggle } = useTheme();
  const [helpOpen, setHelpOpen] = useState(false);
  const [announcement, setAnnouncement] = useState(null);

  // The first alert only gives a first guess at title and severity. The banner follows the
  // updates that arrive as more alerts join the incident.
  const connection = useLiveUpdates((type, data) => {
    if (type === 'incident.created') setAnnouncement(data);
    if (type === 'incident.updated') setAnnouncement((current) => (current?.number === data.number ? data : current));
  });

  useEffect(() => {
    if (!announcement) return;
    const timer = setTimeout(() => setAnnouncement(null), ANNOUNCEMENT_MS);
    return () => clearTimeout(timer);
  }, [announcement]);

  useHotkeys({
    'g o': () => navigate('/'),
    'g i': () => navigate('/incidents'),
    'g r': () => navigate('/runbooks'),
    t: toggle,
    '?': () => setHelpOpen(true),
  });

  return (
    <div className={styles.shell}>
      <a className={styles.skip} href="#main">
        Skip to content
      </a>

      <header className={styles.topbar}>
        <Link to="/" className={styles.brand} aria-label="OpsPilot overview">
          <BrandMark />
        </Link>

        <nav className={styles.nav} aria-label="Main">
          <NavLink to="/" end className={styles.navLink}>
            Overview
          </NavLink>
          <NavLink to="/incidents" className={styles.navLink}>
            Incidents
          </NavLink>
          <NavLink to="/runbooks" className={styles.navLink}>
            Runbooks
          </NavLink>
        </nav>

        <div className={styles.tools}>
          <LiveIndicator status={connection} />
          <button
            type="button"
            className={styles.iconButton}
            onClick={() => setHelpOpen(true)}
            title="Keyboard shortcuts (?)"
          >
            <KeyboardIcon label="Keyboard shortcuts" />
          </button>
          <button type="button" className={styles.iconButton} onClick={toggle} title="Switch theme (t)">
            {theme === 'dark' ? <SunIcon label="Switch to light theme" /> : <MoonIcon label="Switch to dark theme" />}
          </button>
          <div className={styles.user}>
            <span className={styles.userName}>{user.name}</span>
            <span className="caption">{user.role}</span>
          </div>
          <button type="button" className={styles.textButton} onClick={logout}>
            Sign out
          </button>
        </div>
      </header>

      <div aria-live="polite" className={styles.announcements}>
        {announcement && (
          <div className={styles.announcement}>
            <span className="caption">New incident</span>
            <SeverityTag severity={announcement.severity} />
            <Link
              to={`/incidents/${announcement.number}`}
              className={styles.announcementLink}
              onClick={() => setAnnouncement(null)}
            >
              <span className="mono">{incidentId(announcement.number)}</span> {announcement.title}
              <ArrowRightIcon />
            </Link>
            <button type="button" className={styles.iconButton} onClick={() => setAnnouncement(null)}>
              <CloseIcon label="Dismiss" />
            </button>
          </div>
        )}
      </div>

      <main id="main" className={styles.main}>
        <Outlet />
      </main>

      {helpOpen && <ShortcutHelp onClose={() => setHelpOpen(false)} />}
    </div>
  );
}

const CONNECTION_LABEL = { live: 'Live', connecting: 'Connecting', reconnecting: 'Reconnecting' };

function LiveIndicator({ status }) {
  return (
    <span className={styles.live} data-status={status} title="Live updates from the server">
      <span className={styles.liveDot} aria-hidden="true" />
      {CONNECTION_LABEL[status]}
    </span>
  );
}
