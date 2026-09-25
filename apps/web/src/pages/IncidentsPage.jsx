import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { useIncidents } from '../lib/queries.js';
import { dateTime, duration, incidentId, timeAgo } from '../lib/format.js';
import { useHotkeys } from '../hooks/useHotkeys.js';
import { useNow } from '../hooks/useNow.js';
import { Panel } from '../components/Panel.jsx';
import { Empty, QueryState } from '../components/States.jsx';
import { SeverityTag, ServiceChip, StatusTag } from '../components/Tags.jsx';
import styles from './IncidentsPage.module.css';

const STATUS_FILTERS = [
  { value: 'active', label: 'Active' },
  { value: 'resolved', label: 'Resolved' },
  { value: '', label: 'All' },
];

export function IncidentsPage() {
  const [params, setParams] = useSearchParams();
  const filters = {
    status: params.get('status') ?? 'active',
    severity: params.get('severity') ?? '',
    service: params.get('service') ?? '',
  };
  const incidents = useIncidents(filters);

  // Filters live in the URL, so a filtered view can be bookmarked or shared.
  function setFilter(name, value) {
    const next = new URLSearchParams(params);
    next.set(name, value);
    setParams(next, { replace: true });
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1>Incidents</h1>
        <div className={styles.filters} role="group" aria-label="Filter incidents">
          <div className={styles.segmented}>
            {STATUS_FILTERS.map(({ value, label }) => (
              <button
                key={label}
                type="button"
                aria-pressed={filters.status === value}
                onClick={() => setFilter('status', value)}
              >
                {label}
              </button>
            ))}
          </div>
          <label className={styles.select}>
            <span className="caption">Severity</span>
            <select value={filters.severity} onChange={(event) => setFilter('severity', event.target.value)}>
              <option value="">Any</option>
              <option value="critical">Critical</option>
              <option value="warning">Warning</option>
            </select>
          </label>
          <label className={styles.select}>
            <span className="caption">Service</span>
            <select value={filters.service} onChange={(event) => setFilter('service', event.target.value)}>
              <option value="">Any</option>
              {['checkout', 'gateway', 'inventory', 'payments'].map((service) => (
                <option key={service} value={service}>
                  {service}
                </option>
              ))}
            </select>
          </label>
        </div>
      </header>

      <Panel title="Incident log" meta={incidents.data && `${incidents.data.length} shown`} flush>
        <QueryState query={incidents} loadingLabel="Loading incidents">
          {(list) =>
            list.length === 0 ? (
              <Empty title={filters.status === 'active' ? 'No active incidents' : 'No incidents match these filters'}>
                Try "All" to see the full history.
              </Empty>
            ) : (
              <IncidentTable incidents={list} />
            )
          }
        </QueryState>
      </Panel>
    </div>
  );
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

  return (
    <table className={styles.table}>
      <thead>
        <tr>
          <th scope="col">Incident</th>
          <th scope="col">Severity</th>
          <th scope="col">What happened</th>
          <th scope="col">Services</th>
          <th scope="col">Status</th>
          <th scope="col">Started</th>
          <th scope="col">Duration</th>
        </tr>
      </thead>
      <tbody>
        {incidents.map((incident, index) => {
          const end = incident.resolvedAt ? new Date(incident.resolvedAt) : now;
          return (
            <tr
              key={incident.id}
              ref={(row) => (rowRefs.current[index] = row)}
              data-selected={index === current || undefined}
              onPointerEnter={() => setSelected(index)}
            >
              <td className="mono">{incidentId(incident.number)}</td>
              <td>
                <SeverityTag severity={incident.severity} />
              </td>
              <td className={styles.titleCell}>
                <Link to={`/incidents/${incident.number}`} className={styles.titleLink}>
                  {incident.title}
                </Link>
                {incident.firingAlerts > 0 && <span className={styles.firing}>{incident.firingAlerts} firing</span>}
              </td>
              <td>
                <span className={styles.services}>
                  {incident.services.map((service) => (
                    <ServiceChip key={service} service={service} emphasis={service === incident.suspectedService} />
                  ))}
                </span>
              </td>
              <td>
                <StatusTag status={incident.status} />
              </td>
              <td className={styles.muted} title={dateTime(incident.startedAt)}>
                {timeAgo(incident.startedAt, now)}
              </td>
              <td className="mono numeric">{duration(end - new Date(incident.startedAt))}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
