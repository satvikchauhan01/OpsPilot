import { useState } from 'react';
import { Link } from 'react-router';
import { useChanges, useIncidents, useRunbooks, useServiceMetrics, useServices, useTopology } from '../lib/queries.js';
import { clock, incidentId, latency, percent, rate, timeAgo } from '../lib/format.js';
import { useNow } from '../hooks/useNow.js';
import { HoverTimeProvider } from '../charts/HoverTime.jsx';
import { TimeSeriesChart } from '../charts/TimeSeriesChart.jsx';
import { Dialog } from '../components/Dialog.jsx';
import { Segmented } from '../components/Segmented.jsx';
import { Empty, QueryState } from '../components/States.jsx';
import { HealthTag, SeverityTag, ServiceChip, StatusTag } from '../components/Tags.jsx';
import { ArrowRightIcon, CloseIcon } from '../components/Icons.jsx';
import styles from './ServiceDrawer.module.css';

const RANGES = [
  { value: 60, label: '1 h' },
  { value: 360, label: '6 h' },
  { value: 1440, label: '24 h' },
];

// Same limits as the alert rules, so a line crossing one shows when an alert would fire.
const CHARTS = [
  { metric: 'errorRatio', title: 'Error rate', format: (v) => percent(v), threshold: { value: 0.05, label: '5%' } },
  { metric: 'p95', title: 'Latency, p95', format: latency, threshold: { value: 1, label: '1 s' } },
  { metric: 'rps', title: 'Requests per second', format: rate },
  {
    metric: 'memory',
    title: 'Memory used of limit',
    format: (v) => percent(v, 0),
    threshold: { value: 0.8, label: '80%' },
  },
];

// Everything about one service on one sheet: how it is now, its last hours, who it talks to,
// what changed, and the incidents and runbooks that concern it.
export function ServiceDrawer({ name, onClose }) {
  const services = useServices();
  const [minutes, setMinutes] = useState(60);
  const row = services.data?.services.find((service) => service.name === name);
  const titleId = `service-${name}-title`;

  return (
    <Dialog onClose={onClose} labelledBy={titleId} placement="side">
      <header className={styles.header}>
        <div className={styles.heading}>
          <p className={styles.kicker}>Service</p>
          <h2 id={titleId} className={styles.name}>
            <ServiceChip service={name} size="large" />
          </h2>
          {row && <HealthTag status={row.status} />}
        </div>
        <button type="button" className={styles.close} onClick={onClose}>
          <CloseIcon label="Close" />
        </button>
      </header>

      <div className={styles.body}>
        <QueryState query={services} loadingLabel="Reading service health">
          {() =>
            row ? <Now row={row} /> : <Empty title={`No data for ${name}`}>It doesn't report metrics right now.</Empty>
          }
        </QueryState>

        <section className={styles.section} aria-labelledby={`${titleId}-charts`}>
          <div className={styles.sectionHead}>
            <h3 id={`${titleId}-charts`}>History</h3>
            <Segmented label="Time range" size="sm" options={RANGES} value={minutes} onChange={setMinutes} />
          </div>
          <Charts name={name} minutes={minutes} />
        </section>

        <Calls name={name} />
        <Changes name={name} />
        <Incidents name={name} />
        <Runbooks name={name} />
      </div>
    </Dialog>
  );
}

function Now({ row }) {
  const workload = row.workload;
  return (
    <section className={styles.now}>
      {workload && (
        <p className={styles.workload}>
          <span className="mono">v{workload.version ?? '?'}</span>
          <span>
            <span className="mono numeric">
              {workload.ready}/{workload.desired}
            </span>{' '}
            pods ready
          </span>
          {workload.revision && <span className="mono">revision {workload.revision}</span>}
        </p>
      )}
      <dl className={styles.figures}>
        <Figure label="Traffic" value={rate(row.rps)} />
        <Figure label="Errors" value={percent(row.errorRatio)} bad={row.errorRatio > 0.05} />
        <Figure label="p95" value={latency(row.p95)} bad={row.p95 > 1} />
        <Figure label="Memory" value={percent(row.memory, 0)} bad={row.memory > 0.8} />
        {row.saturation !== null && (
          <Figure label="Workers busy" value={percent(row.saturation, 0)} bad={row.saturation > 0.9} />
        )}
      </dl>
      {row.firingAlerts.length > 0 && (
        <p className={styles.firing}>
          <span className="caption">Firing</span>
          {row.firingAlerts.map((alert) => (
            <span key={alert} className={styles.alert}>
              {alert}
            </span>
          ))}
        </p>
      )}
    </section>
  );
}

function Figure({ label, value, bad }) {
  return (
    <div className={styles.figure} data-bad={bad || undefined}>
      <dt className="caption">{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function Charts({ name, minutes }) {
  const metrics = useServiceMetrics(name, minutes);
  return (
    <QueryState query={metrics} loadingLabel="Querying Prometheus">
      {(data) => {
        const domain = [new Date(data.window.start).getTime(), new Date(data.window.end).getTime()];
        const charts = CHARTS.filter((chart) => data.metrics[chart.metric].length > 0);
        if (charts.length === 0) return <Empty title="No samples in this range" />;
        return (
          <HoverTimeProvider>
            <div className={styles.charts} style={{ opacity: metrics.isPlaceholderData ? 0.6 : 1 }}>
              {charts.map((chart) => (
                <TimeSeriesChart
                  key={chart.metric}
                  title={chart.title}
                  series={data.metrics[chart.metric]}
                  domain={domain}
                  format={chart.format}
                  threshold={chart.threshold}
                  height={130}
                />
              ))}
            </div>
          </HoverTimeProvider>
        );
      }}
    </QueryState>
  );
}

function Calls({ name }) {
  const topology = useTopology();
  const edges = topology.data?.edges ?? [];
  const callers = edges.filter((edge) => edge.target === name);
  const calls = edges.filter((edge) => edge.source === name);
  if (callers.length === 0 && calls.length === 0) return null;

  return (
    <section className={styles.section}>
      <h3>Talks to</h3>
      <div className={styles.calls}>
        <div>
          <p className="caption">Called by</p>
          <ul>
            {callers.map((edge) => (
              <li key={edge.source}>
                {edge.source === 'user' ? (
                  <span className="mono">customers</span>
                ) : (
                  <ServiceChip service={edge.source} />
                )}
                <span className="mono numeric">{rate(edge.rps)}</span>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <p className="caption">Calls</p>
          <ul>
            {calls.length === 0 && <li className={styles.muted}>nothing</li>}
            {calls.map((edge) => (
              <li key={edge.target} data-bad={edge.errorRatio > 0.05 || undefined}>
                <ServiceChip service={edge.target} />
                <span className="mono numeric">
                  {rate(edge.rps)} · {percent(edge.errorRatio)} failing
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

function Changes({ name }) {
  const changes = useChanges(24 * 60, name);
  const now = useNow(30_000);
  return (
    <section className={styles.section}>
      <h3>Changes, last 24 hours</h3>
      <QueryState query={changes} loadingLabel="Loading changes">
        {(list) =>
          list.length === 0 ? (
            <p className={styles.muted}>No deploys, restarts or scaling.</p>
          ) : (
            <ol className={styles.list}>
              {list.slice(0, 8).map((change) => (
                <li key={change.id}>
                  <time className="mono" dateTime={change.at} title={timeAgo(change.at, now)}>
                    {clock(change.at)}
                  </time>
                  <span className={styles.kind}>{change.kind.replace('_', ' ')}</span>
                  <span className={styles.text}>{change.summary}</span>
                </li>
              ))}
            </ol>
          )
        }
      </QueryState>
    </section>
  );
}

function Incidents({ name }) {
  const incidents = useIncidents({ service: name, limit: 5 });
  return (
    <section className={styles.section}>
      <h3>Incidents</h3>
      <QueryState query={incidents} loadingLabel="Loading incidents">
        {(list) =>
          list.length === 0 ? (
            <p className={styles.muted}>None so far.</p>
          ) : (
            <ul className={styles.list}>
              {list.map((incident) => (
                <li key={incident.id}>
                  <Link to={`/incidents/${incident.number}`} className={styles.incident}>
                    <span className="mono">{incidentId(incident.number)}</span>
                    <SeverityTag severity={incident.severity} />
                    <span className={styles.text}>{incident.title}</span>
                    <StatusTag status={incident.status} />
                  </Link>
                </li>
              ))}
            </ul>
          )
        }
      </QueryState>
      <Link to={`/incidents?status=&service=${name}`} className={styles.more}>
        Every incident involving {name} <ArrowRightIcon size={14} />
      </Link>
    </section>
  );
}

function Runbooks({ name }) {
  const runbooks = useRunbooks();
  const own = (runbooks.data ?? []).filter((runbook) => runbook.services.includes(name));
  if (own.length === 0) return null;
  return (
    <section className={styles.section}>
      <h3>Runbooks</h3>
      <ul className={styles.list}>
        {own.map((runbook) => (
          <li key={runbook.slug}>
            <Link to={`/runbooks/${runbook.slug}`} className={styles.runbook}>
              <span>{runbook.title}</span>
              <span className={styles.muted}>{runbook.summary}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
