import { Link, useNavigate } from 'react-router';
import { useChanges, useIncidents, useInsights, useServices, useTopology } from '../lib/queries.js';
import { serviceColor } from '../lib/colors.js';
import { clock, duration, incidentId, latency, percent, plural, rate, timeAgo } from '../lib/format.js';
import { useNow } from '../hooks/useNow.js';
import { useServiceLink } from '../services/serviceLink.js';
import { ButtonLink } from '../components/Button.jsx';
import { Panel } from '../components/Panel.jsx';
import { Stat, Stats } from '../components/Stat.jsx';
import { Empty, QueryState } from '../components/States.jsx';
import { HealthTag, SeverityTag, ServiceChip, StatusTag, ToneMark } from '../components/Tags.jsx';
import { ArrowRightIcon } from '../components/Icons.jsx';
import { Sparkline } from '../charts/Sparkline.jsx';
import { TopologyMap } from '../topology/TopologyMap.jsx';
import { IncidentProgress } from '../incident/IncidentProgress.jsx';
import styles from './OverviewPage.module.css';

const MEMORY_WARNING = 0.8;

export function OverviewPage() {
  const services = useServices();
  const incidents = useIncidents({ status: 'active' });
  const topology = useTopology();
  const insights = useInsights(7);
  const now = useNow(15_000);

  const rows = services.data?.services ?? [];
  const edge = edgeService(topology.data, rows);

  return (
    <div className={styles.page}>
      <Headline incidents={incidents.data} services={services.data?.services} at={services.data?.at} />

      <Stats label="Right now">
        <Stat
          label="Active incidents"
          value={incidents.data?.length ?? '—'}
          tone={toneOf(incidents.data)}
          detail={incidents.data?.length ? `oldest open ${oldestAge(incidents.data, now)}` : 'nothing open'}
        />
        <Stat
          label="Services healthy"
          value={rows.length ? rows.filter((row) => row.status === 'ok').length : '—'}
          unit={rows.length ? `/ ${rows.length}` : undefined}
          detail={rows.length ? 'no alerts firing on them' : 'waiting for metrics'}
        />
        <Stat
          label="Customer error rate"
          value={percent(edge?.errorRatio)}
          tone={edge?.errorRatio > 0.05 ? 'critical' : undefined}
          detail={edge ? `at ${edge.name}, the front door` : 'no traffic yet'}
        />
        <Stat
          label="Customer latency p95"
          value={latency(edge?.p95)}
          tone={edge?.p95 > 1 ? 'critical' : undefined}
          detail={edge ? `${rate(edge.rps)} coming in` : 'no traffic yet'}
        />
        <Stat
          label="Median time to resolve"
          value={insights.data?.timing.toResolve.median ? duration(insights.data.timing.toResolve.median) : '—'}
          detail={
            insights.data?.timing.toResolve.count
              ? `over ${plural(insights.data.timing.toResolve.count, 'incident')}, last 7 days`
              : 'no incidents in the last 7 days'
          }
        />
      </Stats>

      <div className={styles.grid}>
        <ServiceMapPanel topology={topology} rows={rows} />
        <ActiveIncidents query={incidents} now={now} />
      </div>

      <Panel title="Services" meta={services.data && `updated ${clock(services.data.at)}`} flush>
        <QueryState query={services} loadingLabel="Reading service health">
          {({ services: list }) =>
            list.length === 0 ? (
              <Empty title="No services reporting yet">Start the local cluster with npm run cluster:up.</Empty>
            ) : (
              <ServiceBoard rows={list} />
            )
          }
        </QueryState>
      </Panel>

      <ChangeFeed now={now} />
    </div>
  );
}

// The service customers call first: the one the outside world sends the most traffic to.
function edgeService(topology, rows) {
  const entry = (topology?.edges ?? []).filter((edge) => edge.source === 'user').sort((a, b) => b.rps - a.rps)[0];
  return entry ? rows.find((row) => row.name === entry.target) : null;
}

function toneOf(incidents) {
  if (!incidents) return undefined;
  if (incidents.some((incident) => incident.severity === 'critical')) return 'critical';
  return incidents.length > 0 ? 'warning' : 'ok';
}

function oldestAge(incidents, now) {
  const oldest = Math.min(...incidents.map((incident) => new Date(incident.startedAt).getTime()));
  return duration(now - oldest);
}

function Headline({ incidents, services, at }) {
  if (!incidents || !services) return <section className={styles.headline} aria-busy="true" />;

  const tone = toneOf(incidents);
  const lead = incidents[0];
  const unhealthy = services.filter((service) => service.status !== 'ok').map((service) => service.name);
  const others = lead ? lead.services.filter((service) => service !== lead.suspectedService) : [];

  return (
    <section className={styles.headline} data-tone={tone} aria-live="polite">
      <div className={styles.headlineText}>
        <p className={styles.kicker}>
          <ToneMark tone={tone} />
          {at ? `Shop status at ${clock(at)}` : 'Shop status'}
        </p>
        <h1 className={styles.title}>
          {incidents.length === 0
            ? 'No active incidents'
            : `${incidents.length} active incident${incidents.length === 1 ? '' : 's'}`}
        </h1>
        <p className={styles.subline}>
          {lead?.suspectedService ? (
            <>
              <ServiceChip service={lead.suspectedService} emphasis /> is the likely origin
              {others.length > 0 && (
                <>
                  , and it reaches{' '}
                  {others.map((service, index) => (
                    <span key={service} className={styles.listed}>
                      {index > 0 && (index === others.length - 1 ? ' and ' : ', ')}
                      <ServiceChip service={service} />
                    </span>
                  ))}
                </>
              )}
            </>
          ) : unhealthy.length > 0 ? (
            `${unhealthy.join(', ')} alerting.`
          ) : (
            `${services.length} services reporting, no alerts firing.`
          )}
        </p>
      </div>
      {lead && (
        <ButtonLink to={`/incidents/${lead.number}`} variant="primary" size="lg">
          Open {incidentId(lead.number)}
          <ArrowRightIcon />
        </ButtonLink>
      )}
    </section>
  );
}

function ServiceMapPanel({ topology, rows }) {
  const navigate = useNavigate();
  const serviceLink = useServiceLink();
  const health = Object.fromEntries(rows.map((row) => [row.name, row.status]));

  return (
    <div data-tour="service-map" className={styles.map}>
      <Panel title="Service map" meta="live traffic, from traces" className={styles.mapPanel}>
        <QueryState query={topology} loadingLabel="Reading the service graph">
          {(graph) =>
            graph.nodes.length === 0 ? (
              <Empty title="No traffic seen yet">
                The map is built from traces, so it fills in once requests flow.
              </Empty>
            ) : (
              <>
                <TopologyMap
                  nodes={graph.nodes}
                  edges={graph.edges}
                  health={health}
                  onOpen={(name) => navigate(serviceLink(name))}
                />
                <p className={styles.mapHint}>
                  Packets move at the real request rate; red ones are failing calls. Point at a service to see who it
                  talks to, click it for details.
                </p>
              </>
            )
          }
        </QueryState>
      </Panel>
    </div>
  );
}

function ServiceBoard({ rows }) {
  const navigate = useNavigate();
  const serviceLink = useServiceLink();

  return (
    <div className={styles.boardWrap}>
      <table className={styles.board}>
        <thead>
          <tr>
            <th scope="col">Service</th>
            <th scope="col">Health</th>
            <th scope="col">Traffic, 1 h</th>
            <th scope="col">Errors, 1 h</th>
            <th scope="col">p95</th>
            <th scope="col">Memory</th>
            <th scope="col">Firing</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((service) => (
            <tr key={service.name} data-status={service.status} onClick={() => navigate(serviceLink(service.name))}>
              <th scope="row">
                <Link
                  to={serviceLink(service.name)}
                  className={styles.serviceLink}
                  onClick={(event) => event.stopPropagation()}
                >
                  <ServiceChip service={service.name} emphasis />
                </Link>
                {service.workload && (
                  <span className={styles.workload}>
                    v{service.workload.version} · {service.workload.ready}/{service.workload.desired} pods
                  </span>
                )}
              </th>
              <td data-label="Health">
                <HealthTag status={service.status} />
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
              <td data-label="p95" className="mono numeric" data-bad={service.p95 > 1 || undefined}>
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

function ActiveIncidents({ query, now }) {
  return (
    <Panel
      title="Active incidents"
      meta={query.data && `${query.data.length} open`}
      className={styles.incidentsPanel}
      flush
    >
      <QueryState query={query} loadingLabel="Loading incidents">
        {(list) =>
          list.length === 0 ? (
            <Empty title="Nothing is on fire">New incidents appear here the moment alerts arrive.</Empty>
          ) : (
            <ul className={styles.incidents}>
              {list.map((incident) => (
                <li key={incident.id}>
                  <Link to={`/incidents/${incident.number}`} className={styles.incident} data-tone={incident.severity}>
                    <span className={styles.incidentTop}>
                      <span className="mono">{incidentId(incident.number)}</span>
                      <SeverityTag severity={incident.severity} />
                      <span className={styles.age}>{duration(now - new Date(incident.startedAt))}</span>
                    </span>
                    <span className={styles.incidentTitle}>{incident.title}</span>
                    <span className={styles.incidentBottom}>
                      <StatusTag status={incident.status} />
                      <IncidentProgress progress={incident.progress} />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )
        }
      </QueryState>
    </Panel>
  );
}

function ChangeFeed({ now }) {
  const changes = useChanges(60);
  const serviceLink = useServiceLink();

  return (
    <Panel title="Changes" meta="last hour" flush>
      <QueryState query={changes} loadingLabel="Loading changes">
        {(list) =>
          list.length === 0 ? (
            <Empty title="No changes in the last hour">Deploys, scaling and restarts in the shop show up here.</Empty>
          ) : (
            <ol className={styles.changes}>
              {list.slice(0, 8).map((change) => (
                <li key={change.id} data-kind={change.kind}>
                  <time className="mono" dateTime={change.at}>
                    {clock(change.at)}
                  </time>
                  <span className={styles.changeKind}>{change.kind.replace('_', ' ')}</span>
                  <Link to={serviceLink(change.service)} className={styles.serviceLink}>
                    <ServiceChip service={change.service} />
                  </Link>
                  <span className={styles.changeSummary}>{change.summary}</span>
                  <span className={styles.ago}>{timeAgo(change.at, now)}</span>
                </li>
              ))}
            </ol>
          )
        }
      </QueryState>
    </Panel>
  );
}
