import { useEffect, useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router';
import { useAuth } from '../auth/AuthContext.jsx';
import { useTheme } from '../hooks/useTheme.js';
import { useHotkeys } from '../hooks/useHotkeys.js';
import { useLiveUpdates } from '../hooks/useLiveUpdates.js';
import { useMediaQuery } from '../hooks/useMediaQuery.js';
import { useStoredState } from '../hooks/useStoredState.js';
import {
  BellIcon,
  CompassIcon,
  KeyboardIcon,
  MoonIcon,
  SidebarIcon,
  SignOutIcon,
  SunIcon,
} from '../components/Icons.jsx';
import { toastForEvent } from '../notifications/events.js';
import { useToasts } from '../notifications/useToasts.js';
import { useBrowserNotifications } from '../notifications/useBrowserNotifications.js';
import { Toaster } from '../notifications/Toaster.jsx';
import { CommandPalette } from '../palette/CommandPalette.jsx';
import { ServiceDrawer } from '../services/ServiceDrawer.jsx';
import { Tour } from '../tour/Tour.jsx';
import { ConsoleContext } from './ConsoleContext.js';
import { sectionsFor } from './navigation.js';
import { Sidebar } from './Sidebar.jsx';
import { TopBar } from './TopBar.jsx';
import { ShortcutHelp } from './ShortcutHelp.jsx';
import styles from './Shell.module.css';

const NOTIFICATION_NEWS = {
  on: {
    tone: 'ok',
    title: 'Browser notifications on',
    detail: 'New incidents and failed or waiting fixes reach you while this tab is in the background.',
  },
  off: { tone: 'neutral', title: 'Browser notifications off' },
  blocked: {
    tone: 'warning',
    title: 'Notifications are blocked',
    detail: 'Allow them for this site in the browser settings, then turn them on again.',
  },
  unsupported: { tone: 'warning', title: 'This browser has no notifications' },
};

export function Shell() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuth();
  const { theme, toggle: toggleTheme } = useTheme();
  const narrow = useMediaQuery('(max-width: 900px)');
  const [collapsed, setCollapsed] = useStoredState('opspilot-sidebar-collapsed', false);
  const [tourSeen, setTourSeen] = useStoredState('opspilot-tour-seen', false);
  const [navOpen, setNavOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  // A guest's first visit starts with the tour
  const [touring, setTouring] = useState(() => user.role === 'guest' && !tourSeen);
  const { toasts, push, dismiss } = useToasts();
  const notifications = useBrowserNotifications();

  const connection = useLiveUpdates((type, data) => {
    const toast = toastForEvent(type, data);
    if (toast && push(toast)) notifications.show(toast, () => navigate(toast.link.to));
  });

  useEffect(() => {
    function onKeyDown(event) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setPaletteOpen((open) => !open);
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const pages = sectionsFor(user).flatMap((section) => section.items);
  useHotkeys({
    ...Object.fromEntries(pages.map((page) => [page.keys, () => navigate(page.to)])),
    t: toggleTheme,
    '?': () => setHelpOpen(true),
    '[': () => setCollapsed((current) => !current),
  });

  function startTour() {
    setNavOpen(false);
    setTouring(true);
  }

  function endTour() {
    setTouring(false);
    setTourSeen(true);
  }

  async function toggleNotifications() {
    push(NOTIFICATION_NEWS[await notifications.toggle()]);
  }

  const service = new URLSearchParams(location.search).get('service');
  function closeService() {
    const params = new URLSearchParams(location.search);
    params.delete('service');
    navigate(
      { pathname: location.pathname, search: params.size ? `?${params}` : '', hash: location.hash },
      { replace: true },
    );
  }

  const commands = [
    {
      id: 'theme',
      label: theme === 'dark' ? 'Switch to the light theme' : 'Switch to the dark theme',
      keys: 't',
      icon: theme === 'dark' ? SunIcon : MoonIcon,
      run: toggleTheme,
    },
    {
      id: 'sidebar',
      label: collapsed ? 'Expand the sidebar' : 'Collapse the sidebar',
      keys: '[',
      icon: SidebarIcon,
      run: () => setCollapsed((current) => !current),
    },
    {
      id: 'notifications',
      label: notifications.enabled ? 'Turn off browser notifications' : 'Turn on browser notifications',
      icon: BellIcon,
      run: toggleNotifications,
    },
    { id: 'tour', label: 'Take the guided tour', icon: CompassIcon, run: startTour },
    { id: 'help', label: 'Show keyboard shortcuts', keys: '?', icon: KeyboardIcon, run: () => setHelpOpen(true) },
    { id: 'sign-out', label: 'Sign out', icon: SignOutIcon, run: logout },
  ];

  const shell = { openPalette: () => setPaletteOpen(true), openHelp: () => setHelpOpen(true), startTour, toast: push };

  return (
    <ConsoleContext.Provider value={shell}>
      <div className={styles.shell}>
        <a className={styles.skip} href="#main">
          Skip to content
        </a>

        <Sidebar
          open={navOpen}
          collapsed={collapsed && !narrow}
          connection={connection}
          theme={theme}
          notifications={notifications.enabled}
          onNavigate={() => setNavOpen(false)}
          onToggleCollapsed={() => setCollapsed((current) => !current)}
          onToggleTheme={toggleTheme}
          onToggleNotifications={toggleNotifications}
          onOpenPalette={() => {
            setNavOpen(false);
            setPaletteOpen(true);
          }}
          onOpenHelp={() => setHelpOpen(true)}
        />
        {navOpen && <div className={styles.scrim} onClick={() => setNavOpen(false)} aria-hidden="true" />}

        <div className={styles.column}>
          <TopBar onOpenNav={() => setNavOpen(true)} onOpenPalette={() => setPaletteOpen(true)} />
          <main id="main" className={styles.main}>
            <Outlet />
          </main>
        </div>

        <Toaster toasts={toasts} onDismiss={dismiss} />
        {paletteOpen && <CommandPalette commands={commands} onClose={() => setPaletteOpen(false)} />}
        {helpOpen && <ShortcutHelp onClose={() => setHelpOpen(false)} />}
        {service && <ServiceDrawer key={service} name={service} onClose={closeService} />}
        {touring && <Tour onClose={endTour} />}
      </div>
    </ConsoleContext.Provider>
  );
}
