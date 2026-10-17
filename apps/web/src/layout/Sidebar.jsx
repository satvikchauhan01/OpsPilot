import { NavLink } from 'react-router';
import { useAuth } from '../auth/AuthContext.jsx';
import { useAiStatus, useDemo, useIncidents } from '../lib/queries.js';
import { BrandMark } from '../components/BrandMark.jsx';
import { Kbd } from '../components/Kbd.jsx';
import {
  BellIcon,
  KeyboardIcon,
  MoonIcon,
  SearchIcon,
  SidebarIcon,
  SignOutIcon,
  SunIcon,
} from '../components/Icons.jsx';
import { sectionsFor } from './navigation.js';
import styles from './Sidebar.module.css';

const CONNECTION_LABEL = { live: 'Live', connecting: 'Connecting', reconnecting: 'Reconnecting' };

export function Sidebar({
  open,
  collapsed,
  connection,
  theme,
  notifications,
  onNavigate,
  onToggleCollapsed,
  onToggleTheme,
  onToggleNotifications,
  onOpenPalette,
  onOpenHelp,
}) {
  const { user, logout } = useAuth();
  const incidents = useIncidents({ status: 'active' });
  const demo = useDemo();
  const active = incidents.data ?? [];

  function badge(to) {
    if (to === '/incidents' && active.length > 0) {
      const critical = active.some((incident) => incident.severity === 'critical');
      return (
        <span className={styles.count} data-tone={critical ? 'critical' : 'warning'}>
          {active.length}
          <span className="visually-hidden"> active</span>
        </span>
      );
    }
    if (to === '/demo' && demo.data?.active) {
      return <span className={styles.running} title="A scenario is running" />;
    }
    return null;
  }

  return (
    <aside className={styles.sidebar} data-collapsed={collapsed || undefined} data-open={open || undefined}>
      <div className={styles.head}>
        <NavLink to="/" className={styles.brand} onClick={onNavigate} aria-label="OpsPilot overview">
          <BrandMark />
        </NavLink>
        <button
          type="button"
          className={styles.collapse}
          onClick={onToggleCollapsed}
          title={collapsed ? 'Expand the sidebar ([)' : 'Collapse the sidebar ([)'}
        >
          <SidebarIcon label={collapsed ? 'Expand the sidebar' : 'Collapse the sidebar'} />
        </button>
      </div>

      <button type="button" className={styles.jump} onClick={onOpenPalette} data-tour="palette">
        <SearchIcon />
        <span className={styles.jumpLabel}>Jump to…</span>
        <span className={styles.jumpKeys} aria-label="Control K">
          <Kbd>Ctrl</Kbd>
          <Kbd>K</Kbd>
        </span>
      </button>

      <nav className={styles.nav} aria-label="Main">
        {sectionsFor(user).map((section) => (
          <div key={section.group} className={styles.group}>
            <p className={styles.groupLabel}>{section.group}</p>
            <ul>
              {section.items.map((item) => (
                <li key={item.to}>
                  <NavLink
                    to={item.to}
                    end={item.end}
                    className={styles.link}
                    onClick={onNavigate}
                    title={collapsed ? item.label : undefined}
                  >
                    <item.icon />
                    <span className={styles.linkLabel}>{item.label}</span>
                    {badge(item.to)}
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>

      <div className={styles.status}>
        <span className={styles.live} data-status={connection} title="Live updates from the server">
          <span className={styles.liveDot} aria-hidden="true" />
          <span className={styles.statusLabel}>{CONNECTION_LABEL[connection]}</span>
        </span>
        <AiBudget />
      </div>

      <div className={styles.user}>
        <div className={styles.who}>
          <span className={styles.avatar} aria-hidden="true">
            {initials(user.name)}
          </span>
          <span className={styles.identity}>
            <span className={styles.name}>{user.name}</span>
            <span className={styles.role}>{user.role}</span>
          </span>
        </div>
        <div className={styles.tools}>
          <button type="button" onClick={onToggleTheme} title="Switch theme (t)">
            {theme === 'dark' ? <SunIcon label="Switch to light theme" /> : <MoonIcon label="Switch to dark theme" />}
          </button>
          <button
            type="button"
            onClick={onToggleNotifications}
            aria-pressed={notifications}
            title={notifications ? 'Browser notifications are on' : 'Turn on browser notifications'}
          >
            <BellIcon label="Browser notifications" />
          </button>
          <button type="button" onClick={onOpenHelp} title="Keyboard shortcuts (?)">
            <KeyboardIcon label="Keyboard shortcuts" />
          </button>
          <button type="button" onClick={logout} title="Sign out">
            <SignOutIcon label="Sign out" />
          </button>
        </div>
      </div>
    </aside>
  );
}

// How much of today's free model quota is left. Investigations stop when it runs out.
function AiBudget() {
  const ai = useAiStatus();
  if (!ai.data?.enabled) return null;
  const { remainingToday, dailyBudget } = ai.data;
  const share = dailyBudget > 0 ? remainingToday / dailyBudget : 0;
  return (
    <span
      className={styles.budget}
      data-low={share < 0.1 || undefined}
      title={`${remainingToday} of ${dailyBudget} AI calls left today (resets at midnight UTC)`}
    >
      <span className={styles.statusLabel}>
        AI calls <span className="mono numeric">{remainingToday}</span>
        <span className={styles.of}>/{dailyBudget}</span>
      </span>
      <span className={styles.budgetTrack} aria-hidden="true">
        <span style={{ width: `${Math.round(share * 100)}%` }} />
      </span>
    </span>
  );
}

function initials(name) {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? '')
    .join('');
}
