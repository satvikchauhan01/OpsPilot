import { Fragment, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { useIncidents } from '../lib/queries.js';
import { dayLabel, dateTime, duration, incidentId, shortClock, timeAgo } from '../lib/format.js';
import { useHotkeys } from '../hooks/useHotkeys.js';
import { useNow } from '../hooks/useNow.js';
import { Field } from '../components/Field.jsx';
import { PageHeader } from '../components/PageHeader.jsx';
import { Panel } from '../components/Panel.jsx';
import { Segmented } from '../components/Segmented.jsx';
import { Empty, QueryState } from '../components/States.jsx';
import { SeverityTag, ServiceChip, StatusTag } from '../components/Tags.jsx';
import { SearchIcon } from '../components/Icons.jsx';
import { IncidentProgress } from '../incident/IncidentProgress.jsx';
import styles from './IncidentsPage.module.css';

const STATUS_FILTERS = [
  { value: 'active', label: 'Active' },
  { value: 'resolved', label: 'Resolved' },
  { value: '', label: 'All' },
];
const SERVICES = ['checkout', 'gateway', 'inventory', 'payments'];

export function IncidentsPage() {
  const [params, setParams] = useSearchParams();
  const filters = {
    status: params.get('status') ?? 'active',
    severity: params.get('severity') ?? '',
    service: params.get('service') ?? '',
  };
  const incidents = useIncidents({ ...filters, limit: 200 });
  const [text, setText] = useState('');
  const searchRef = useRef(null);

  useHotkeys({ '/': () => searchRef.current?.focus() });

  // Filters live in the URL, so a filtered view can be bookmarked or shared.
  function setFilter(name, value) {
    const next = new URLSearchParams(params);
    next.set(name, value);
    setParams(next, { replace: true });
  }

  const shown = (incidents.data ?? []).filter((incident) => matches(incident, text));

  return (
    <div className={styles.page}>
      <PageHeader
        kicker="Operate"
        title="Incidents"
        lede="Alerts that share a cause become one incident. Each row shows how far it got: root cause, fix approved, fix verified, postmortem."
      />

      <div className={styles.toolbar} role="group" aria-label="Filter incidents">
        <Segmented
          label="Status"
          options={STATUS_FILTERS}
          value={filters.status}
          onChange={(value) => setFilter('status', value)}
        />
        <Field label="Severity">
          <select value={filters.severity} onChange={(event) => setFilter('severity', event.target.value)}>
            <option value="">Any</option>
            <option value="critical">Critical</option>
            <option value="warning">Warning</option>
          </select>
        </Field>
        <Field label="Service">
          <select value={filters.service} onChange={(event) => setFilter('service', event.target.value)}>
            <option value="">Any</option>
            {SERVICES.map((service) => (
              <option key={service} value={service}>
                {service}
              </option>
            ))}
          </select>
        </Field>
        <label className={styles.search}>
          <SearchIcon />
          <span className="visually-hidden">Filter by text</span>
          <input
            ref={searchRef}
            type="search"
            value={text}
            placeholder="Filter by title, service or number"
            onChange={(event) => setText(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                setText('');
                event.currentTarget.blur();
              }
            }}
          />
          <kbd className={styles.slash}>/</kbd>
        </label>
      </div>

      <div data-tour="incident-list">
        <Panel
          title="Incident log"
          meta={incidents.data && `${shown.length} shown${text ? ` of ${incidents.data.length}` : ''}`}
          flush
        >
          <QueryState query={incidents} loadingLabel="Loading incidents">
            {(list) =>
              list.length === 0 ? (
                <Empty title={filters.status === 'active' ? 'No active incidents' : 'No incidents match these filters'}>
                  {filters.status === 'active' ? 'Nothing is on fire. ' : ''}Choose “All” to see the full history.
                </Empty>
              ) : shown.length === 0 ? (
                <Empty title={`Nothing matches “${text}”`}>Try part of a service name or an incident number.</Empty>
              ) : (
                <IncidentTable incidents={shown} />
              )
            }
          </QueryState>
        </Panel>
      </div>
    </div>
  );
}

function matches(incident, text) {
  const query = text.trim().toLowerCase();
  if (!query) return true;
  const haystack = [incidentId(incident.number), String(incident.number), incident.title, ...incident.services]
    .join(' ')
    .toLowerCase();
  return query.split(/\s+/).every((word) => haystack.includes(word));
}

function IncidentTable({ incidents }) {
  const navigate = useNavigate();
  const now = useNow(1000);
  const [selected, setSelected] = useState(0);
  const rowRefs = useRef([]);
  const current = Math.min(selected, incidents.length - 1);

  useEffect(() => {
    rowRefs.current[current]?.scrollIntoView({ block: 'nearest' });
  }, [current]);

  useHotkeys({
    j: () => setSelected(Math.min(current + 1, incidents.length - 1)),
    k: () => setSelected(Math.max(current - 1, 0)),
    Enter: () => navigate(`/incidents/${incidents[current].number}`),
  });

  const lengths = incidents.map((incident) => lengthOf(incident, now));
  const longest = Math.max(...lengths, 1);

  return (
    <table className={styles.table}>
      <thead>
        <tr>
          <th scope="col">Incident</th>
          <th scope="col">What happened</th>
          <th scope="col">Progress</th>
          <th scope="col">Status</th>
          <th scope="col">Started</th>
          <th scope="col">Duration</th>
        </tr>
      </thead>
      <tbody>
        {incidents.map((incident, index) => {
          const day = dayLabel(incident.startedAt, now);
          const newDay = index === 0 || day !== dayLabel(incidents[index - 1].startedAt, now);
          return (
            <Fragment key={incident.id}>
              {newDay && (
                <tr className={styles.day}>
                  <th colSpan={6} scope="rowgroup">
                    {day}
                  </th>
                </tr>
              )}
              <tr
                ref={(row) => (rowRefs.current[index] = row)}
                className={styles.row}
                data-selected={index === current || undefined}
                data-tone={incident.severity}
                onPointerEnter={() => setSelected(index)}
                onClick={() => navigate(`/incidents/${incident.number}`)}
              >
                <td className={styles.idCell}>
                  <span className={styles.id}>{incidentId(incident.number)}</span>
                  <SeverityTag severity={incident.severity} />
                </td>
                <td className={styles.titleCell}>
                  <Link
                    to={`/incidents/${incident.number}`}
                    className={styles.titleLink}
                    onClick={(event) => event.stopPropagation()}
                  >
                    {incident.title}
                  </Link>
                  <span className={styles.services}>
                    {incident.services.map((service) => (
                      <ServiceChip key={service} service={service} emphasis={service === incident.suspectedService} />
                    ))}
                    {incident.firingAlerts > 0 && <span className={styles.firing}>{incident.firingAlerts} firing</span>}
                  </span>
                </td>
                <td>
                  <IncidentProgress progress={incident.progress} />
                </td>
                <td>
                  <StatusTag status={incident.status} />
                </td>
                <td className={styles.started} title={dateTime(incident.startedAt)}>
                  <span className={styles.clock}>{shortClock(incident.startedAt)}</span>
                  <span className={styles.ago}>{timeAgo(incident.startedAt, now)}</span>
                </td>
                <td className={styles.duration}>
                  <span className="mono numeric">{duration(lengths[index])}</span>
                  <span className={styles.bar} aria-hidden="true">
                    <span
                      style={{ width: `${Math.max(2, (lengths[index] / longest) * 100)}%` }}
                      data-open={!incident.resolvedAt || undefined}
                    />
                  </span>
                </td>
              </tr>
            </Fragment>
          );
        })}
      </tbody>
    </table>
  );
}

function lengthOf(incident, now) {
  return (incident.resolvedAt ? new Date(incident.resolvedAt) : now) - new Date(incident.startedAt);
}
