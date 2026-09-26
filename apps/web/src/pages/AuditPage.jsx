import { useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { useAudit, useAuditChain } from '../lib/queries.js';
import { ACTION_LABEL } from '../lib/labels.js';
import { dateTime, incidentId } from '../lib/format.js';
import { Panel } from '../components/Panel.jsx';
import { Empty, QueryState } from '../components/States.jsx';
import { ToneMark } from '../components/Tags.jsx';
import styles from './AuditPage.module.css';

const PAGE_SIZE = 50;

const EVENTS = {
  'action.proposed': { label: 'Proposed', tone: 'neutral' },
  'action.approved': { label: 'Approved', tone: 'info' },
  'action.rejected': { label: 'Rejected', tone: 'neutral' },
  'action.superseded': { label: 'Replaced', tone: 'neutral' },
  'action.cancelled': { label: 'Cancelled', tone: 'neutral' },
  'action.started': { label: 'Started', tone: 'info' },
  'action.rolled_out': { label: 'Rolled out', tone: 'info' },
  'action.verifying': { label: 'Verifying', tone: 'info' },
  'action.verified': { label: 'Verified', tone: 'ok' },
  'action.failed': { label: 'Failed', tone: 'critical' },
};

export function AuditPage() {
  const [params, setParams] = useSearchParams();
  const incident = params.get('incident') ?? '';
  const type = params.get('type') ?? '';
  const [pages, setPages] = useState(1);
  const records = useAudit({ incident: incident || undefined, type: type || undefined, limit: PAGE_SIZE * pages });
  const chain = useAuditChain();

  function setFilter(name, value) {
    const next = new URLSearchParams(params);
    if (value) next.set(name, value);
    else next.delete(name);
    setParams(next, { replace: true });
    setPages(1);
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <h1>Audit log</h1>
          <p className={styles.lede}>
            Every fix proposed, approved, rejected and run, and how it turned out. Records are only ever added, and each
            one carries the hash of the one before it, so a change made behind OpsPilot's back shows up here.
          </p>
        </div>
        <ChainStatus query={chain} />
      </header>

      <div className={styles.filters} role="group" aria-label="Filter the audit log">
        <label>
          <span className="caption">Incident</span>
          <input
            type="number"
            min={1}
            placeholder="Any"
            value={incident}
            onChange={(event) => setFilter('incident', event.target.value)}
          />
        </label>
        <label>
          <span className="caption">Event</span>
          <select value={type} onChange={(event) => setFilter('type', event.target.value)}>
            <option value="">Any</option>
            {Object.entries(EVENTS).map(([value, { label }]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <Panel title="Records" meta={records.data && `${records.data.length} shown, newest first`} flush>
        <QueryState query={records} loadingLabel="Loading the audit log">
          {(rows) =>
            rows.length === 0 ? (
              <Empty title="Nothing recorded yet">Fixes show up here from the moment they are proposed.</Empty>
            ) : (
              <>
                <AuditTable rows={rows} />
                {rows.length === PAGE_SIZE * pages && (
                  <button type="button" className={styles.more} onClick={() => setPages(pages + 1)}>
                    Show older records
                  </button>
                )}
              </>
            )
          }
        </QueryState>
      </Panel>
    </div>
  );
}

function ChainStatus({ query }) {
  if (!query.data) return <p className={styles.chain}>Checking the chain…</p>;
  const { intact, records, head, brokenAt } = query.data;
  return (
    <p className={styles.chain} data-intact={intact}>
      <ToneMark tone={intact ? 'ok' : 'critical'} />
      {intact ? (
        <span>
          Chain intact · {records} records
          {head && <span className="mono"> · head {head.slice(0, 12)}</span>}
        </span>
      ) : (
        <span>Chain broken at record {brokenAt}: a record was changed or removed outside OpsPilot</span>
      )}
      <button type="button" onClick={() => query.refetch()} disabled={query.isFetching}>
        Check again
      </button>
    </p>
  );
}

function AuditTable({ rows }) {
  return (
    <div className={styles.tableWrap}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th scope="col">#</th>
            <th scope="col">When</th>
            <th scope="col">Event</th>
            <th scope="col">Incident</th>
            <th scope="col">Fix</th>
            <th scope="col">By</th>
            <th scope="col">Details</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const event = EVENTS[row.type] ?? { label: row.type, tone: 'neutral' };
            return (
              <tr key={row.seq}>
                <td className="mono">{row.seq}</td>
                <td className={styles.when}>{dateTime(row.at)}</td>
                <td>
                  <span className={styles.event}>
                    <ToneMark tone={event.tone} />
                    {event.label}
                  </span>
                </td>
                <td>
                  {row.incidentNumber && (
                    <Link to={`/incidents/${row.incidentNumber}`} className="mono">
                      {incidentId(row.incidentNumber)}
                    </Link>
                  )}
                </td>
                <td className={styles.fix}>
                  {row.data.action && (
                    <>
                      {ACTION_LABEL[row.data.action]} {row.data.params?.service}
                      {row.data.params?.replicas && ` to ${row.data.params.replicas}`}
                    </>
                  )}
                </td>
                <td className={styles.actor}>{row.actor}</td>
                <td className={styles.details}>{details(row)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function details({ type, data }) {
  if (data.error) return `${data.stage}: ${data.error}`;
  if (data.reason) return type === 'action.rejected' ? `“${data.reason}”` : data.reason;
  if (data.plan) return data.plan;
  if (data.seconds) return `in ${data.seconds}s`;
  if (data.samples) return `${data.samples} measurements`;
  if (data.services) return `watching ${data.services.join(', ')}`;
  return '';
}
