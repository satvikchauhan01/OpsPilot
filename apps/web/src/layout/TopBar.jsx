import { Link, useLocation } from 'react-router';
import { useRunbooks } from '../lib/queries.js';
import { clock, incidentId } from '../lib/format.js';
import { useNow } from '../hooks/useNow.js';
import { MenuIcon, SearchIcon } from '../components/Icons.jsx';
import { BrandMark } from '../components/BrandMark.jsx';
import { SECTIONS } from './navigation.js';
import styles from './TopBar.module.css';

const SECTION_LABEL = Object.fromEntries(
  SECTIONS.flatMap((section) => section.items).map((item) => [item.to.slice(1), item.label]),
);

const ZONE = new Intl.DateTimeFormat(undefined, { timeZoneName: 'short' })
  .formatToParts(new Date())
  .find((part) => part.type === 'timeZoneName')?.value;

// Where you are, and the time: incidents are read against the clock.
export function TopBar({ onOpenNav, onOpenPalette }) {
  const crumbs = useBreadcrumbs();
  const now = useNow(1000);

  return (
    <header className={styles.bar}>
      <button type="button" className={styles.icon} onClick={onOpenNav} aria-label="Open navigation">
        <MenuIcon />
      </button>
      <Link to="/" className={styles.brand} aria-label="OpsPilot overview">
        <BrandMark />
      </Link>

      <nav aria-label="Breadcrumb" className={styles.crumbs}>
        <ol>
          {crumbs.map((crumb, index) => (
            <li key={crumb.to}>
              {index < crumbs.length - 1 ? (
                <Link to={crumb.to}>{crumb.label}</Link>
              ) : (
                <span aria-current="page">{crumb.label}</span>
              )}
            </li>
          ))}
        </ol>
      </nav>

      <div className={styles.end}>
        <time className={styles.clock} dateTime={new Date(now).toISOString()}>
          {clock(now)}
          {ZONE && <span className={styles.zone}>{ZONE}</span>}
        </time>
        <button type="button" className={styles.icon} onClick={onOpenPalette} aria-label="Jump to (Ctrl K)">
          <SearchIcon />
        </button>
      </div>
    </header>
  );
}

function useBreadcrumbs() {
  const { pathname } = useLocation();
  const [section, item, detail] = pathname.split('/').filter(Boolean);
  const runbooks = useRunbooks(section === 'runbooks' && Boolean(item));

  if (!section) return [{ to: '/', label: 'Overview' }];
  const crumbs = [{ to: `/${section}`, label: SECTION_LABEL[section] ?? section }];

  if (section === 'incidents' && item) {
    crumbs.push({ to: `/incidents/${item}`, label: incidentId(item) });
    if (detail === 'replay') crumbs.push({ to: pathname, label: 'Replay' });
  }
  if (section === 'runbooks' && item) {
    const runbook = runbooks.data?.find((entry) => entry.slug === item);
    crumbs.push({ to: pathname, label: runbook?.title ?? item });
  }
  return crumbs;
}
