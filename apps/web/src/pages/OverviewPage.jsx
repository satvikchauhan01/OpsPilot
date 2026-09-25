import { useState } from 'react';
import { Link } from 'react-router';
import { useChanges, useIncidents, useServices, useTopology } from '../lib/queries.js';
import { serviceColor } from '../lib/colors.js';
import { clock, duration, incidentId, latency, percent, rate, timeAgo } from '../lib/format.js';
import { useNow } from '../hooks/useNow.js';
import { Panel } from '../components/Panel.jsx';
import { Empty, QueryState } from '../components/States.jsx';
import { HealthTag, SeverityTag, ServiceChip, StatusTag, ToneMark } from '../components/Tags.jsx';
import { Sparkline } from '../charts/Sparkline.jsx';
import { TopologyMap } from '../topology/TopologyMap.jsx';
import styles from './OverviewPage.module.css';

const MEMORY_WARNING = 0.8;

export function OverviewPage() {
  const services = useServices();
  const incidents = useIncidents({ status: 'active' });
  const topology = useTopology();
  const changes = useChanges(60);
  const now = useNow(15_000);

  return (
    <div className={styles.page}>
      <StatusLine incidents={incidents.data} services={services.data?.services} at={services.data?.at} />

      <Panel title="Services" meta={services.data && `updated ${clock(services.data.at)}`} flush>
        <QueryState query={services} loadingLabel="Reading service health">
          {({ services: rows }) =>
            rows.length === 0 ? (
              <Empty title="No services reporting yet">Start the local cluster with npm run cluster:up.</Empty>
            ) : (
              <ServiceBoard rows={rows} />
            )
          }
        </QueryState>
      </Panel>

      <div className={styles.split}>
        <Panel title="Active incidents" meta={incidents.data && `${incidents.data.length} open`} flush>
          <QueryState query={incidents} loadingLabel="Loading incidents">
            {(list) =>
              list.length === 0 ? (
                <Empty title="Nothing is on fire">New incidents appear here the moment alerts arrive.</Empty>
              ) : (
                <ul className={styles.incidentList}>
                  {list.map((incident) => (
                    <li key={incident.id}>
                      <Link to={`/incidents/${incident.number}`} className={styles.incidentRow}>
                        <span className={styles.incidentTop}>
                          <span className="mono">{incidentId(incident.number)}</span>
                          <SeverityTag severity={incident.severity} />
                          <StatusTag status={incident.status} />
                          <span className={styles.incidentAge}>{duration(now - new Date(incident.startedAt))}</span>
                        </span>
                        <span className={styles.incidentTitle}>{incident.title}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )
            }
          </QueryState>
        </Panel>

        <ServiceMapPanel topology={topology} services={services.data?.services ?? []} />
      </div>

      <Panel title="Changes" meta="last hour" flush>
        <QueryState query={changes} loadingLabel="Loading changes">
          {(list) =>
            list.length === 0 ? (
              <Empty title="No changes in the last hour">
                Deploys, scaling and restarts in the shop namespace show up here.
              </Empty>
            ) : (
              <ol className={styles.changes}>
                {list.slice(0, 12).map((change) => (
                  <li key={change.id}>
                    <time className="mono" dateTime={change.at} title={timeAgo(change.at, now)}>
                      {clock(change.at)}
                    </time>
                    <span className={styles.changeKind}>{change.kind.replace('_', ' ')}</span>
                    <ServiceChip service={change.service} />
                    <span className={styles.changeSummary}>{change.summary}</span>
                  </li>
                ))}
              </ol>
            )
          }
        </QueryState>
      </Panel>
    </div>
  );
}

function StatusLine({ incidents, services, at }) {
  if (!incidents || !services) return <div className={styles.status} aria-busy="true" />;

  const unhealthy = services.filter((service) => service.status !== 'ok');
  const tone = incidents.some((incident) => incident.severity === 'critical')
    ? 'critical'
    : incidents.length > 0
      ? 'warning'
      : 'ok';

  return (
    <section className={styles.status} data-tone={tone} aria-live="polite">
      <ToneMark tone={tone} />
      <h1 className={styles.headline}>
        {incidents.length === 0
          ? 'All services healthy'
          : `${incidents.length} active incident${incidents.length === 1 ? '' : 's'}`}
      </h1>
      <p className={styles.subline}>
        {unhealthy.length > 0
          ? `${unhealthy.map((service) => service.name).join(', ')} alerting`
          : `${services.length} services reporting, no alerts firing`}
        {at && <span className="mono"> · as of {clock(at)}</span>}
      </p>
    </section>
  );
}

function ServiceBoard({ rows }) {
  return (
    <div className={styles.boardWrap}>
      <table className={styles.board}>
        <thead>
          <tr>
            <th scope="col">Service</th>
            <th scope="col">Health</th>
            <th scope="col">Version</th>
            <th scope="col">Pods</th>
            <th scope="col">Traffic</th>
            <th scope="col">Errors</th>
            <th scope="col">p95</th>
            <th scope="col">Memory</th>
            <th scope="col">Firing</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((service) => (
            <tr key={service.name} data-status={service.status}>
              <th scope="row">
                <ServiceChip service={service.name} emphasis />
              </th>
              <td data-label="Health">
                <HealthTag status={service.status} />
              </td>
              <td data-label="Version" className="mono">
                {service.workload?.version ?? '—'}
              </td>
              <td data-label="Pods" className="mono numeric">
                {service.workload ? `${service.workload.ready}/${service.workload.desired}` : '—'}
              </td>
              <td data-label="Traffic">
                <span className={styles.trend}>
                  <span className="mono numeric">{rate(service.rps)}</span>
                  <Sparkline
                    points={service.history.rps}
                    color={serviceColor(service.name)}
                    label={`${service.name} traffic, last hour`}
                  />
                </span>
              </td>
              <td data-label="Errors">
                <span className={styles.trend}>
                  <span className="mono numeric" data-bad={service.errorRatio > 0.05 || undefined}>
                    {percent(service.errorRatio)}
                  </span>
                  <Sparkline
                    points={service.history.errorRatio}
                    color={serviceColor(service.name)}
                    max={Math.max(0.1, ...service.history.errorRatio.map(([, v]) => v ?? 0))}
                    label={`${service.name} error rate, last hour`}
                  />
                </span>
              </td>
              <td data-label="p95" className="mono numeric">
                {latency(service.p95)}
              </td>
              <td data-label="Memory">
                <Meter value={service.memory} />
              </td>
              <td data-label="Firing" className={styles.firing}>
                {service.firingAlerts.length === 0 ? (
                  <span className={styles.none}>none</span>
                ) : (
                  service.firingAlerts.join(', ')
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Meter({ value }) {
  if (value === null) return <span className="mono">—</span>;
  const level = value >= 0.9 ? 'critical' : value >= MEMORY_WARNING ? 'warning' : 'ok';
  return (
    <span className={styles.meter} data-level={level}>
      <span
        className={styles.meterTrack}
        role="meter"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(value * 100)}
        aria-label="Memory used of limit"
      >
        <span className={styles.meterFill} style={{ width: `${Math.min(100, value * 100)}%` }} />
        <span className={styles.meterMark} style={{ left: `${MEMORY_WARNING * 100}%` }} />
      </span>
      <span className="mono numeric">{percent(value, 0)}</span>
    </span>
  );
}

function ServiceMapPanel({ topology, services }) {
  const [selected, setSelected] = useState(null);
  const alerting = services.filter((service) => service.status !== 'ok').map((service) => service.name);
  const focus = services.find((service) => service.name === selected);

  return (
    <Panel title="Service map" meta="live traffic">
      <QueryState query={topology} loadingLabel="Reading the service graph">
        {(graph) =>
          graph.nodes.length === 0 ? (
            <Empty title="No traffic seen yet">The map is built from traces, so it fills in once requests flow.</Empty>
          ) : (
            <>
              <TopologyMap
                nodes={graph.nodes}
                edges={graph.edges}
                alerting={alerting}
                selected={selected}
                onSelect={setSelected}
              />
              <p className={styles.mapHint}>
                {focus
                  ? `${focus.name}: ${rate(focus.rps)}, ${percent(focus.errorRatio)} errors, p95 ${latency(focus.p95)}`
                  : 'Select a service to trace its callers and dependencies.'}
              </p>
            </>
          )
        }
      </QueryState>
    </Panel>
  );
}
