import {
  BoltIcon,
  BookIcon,
  IncidentIcon,
  InsightsIcon,
  OverviewIcon,
  ShieldIcon,
  TeamIcon,
} from '../components/Icons.jsx';

// The console's sections in sidebar order. `keys` is the "g" shortcut that opens each one,
// and `role` hides a section from everyone else.
export const SECTIONS = [
  {
    group: 'Operate',
    items: [
      { to: '/', label: 'Overview', icon: OverviewIcon, keys: 'g o', end: true },
      { to: '/incidents', label: 'Incidents', icon: IncidentIcon, keys: 'g i' },
      { to: '/insights', label: 'Insights', icon: InsightsIcon, keys: 'g n' },
    ],
  },
  {
    group: 'Knowledge',
    items: [{ to: '/runbooks', label: 'Runbooks', icon: BookIcon, keys: 'g r' }],
  },
  {
    group: 'Govern',
    items: [
      { to: '/audit', label: 'Audit log', icon: ShieldIcon, keys: 'g a' },
      { to: '/team', label: 'Team', icon: TeamIcon, keys: 'g t', role: 'admin' },
    ],
  },
  {
    group: 'Demo',
    items: [{ to: '/demo', label: 'Demo control', icon: BoltIcon, keys: 'g d' }],
  },
];

export function sectionsFor(user) {
  return SECTIONS.map((section) => ({
    ...section,
    items: section.items.filter((item) => !item.role || item.role === user?.role),
  })).filter((section) => section.items.length > 0);
}
