import { useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { useAudit, useAuditChain } from '../lib/queries.js';
import { ACTION_LABEL } from '../lib/labels.js';
import { dateTime, incidentId, plural } from '../lib/format.js';
import { Button } from '../components/Button.jsx';
import { Field } from '../components/Field.jsx';
import { PageHeader } from '../components/PageHeader.jsx';
import { Panel } from '../components/Panel.jsx';
import { Empty, QueryState } from '../components/States.jsx';
import { ToneMark } from '../components/Tags.jsx';
import { ShieldIcon } from '../components/Icons.jsx';
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
  'user.created': { label: 'Person added', tone: 'info' },
  'user.role_changed': { label: 'Role changed', tone: 'info' },
  'user.removed': { label: 'Person removed', tone: 'neutral' },
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
      <PageHeader
        kicker="Govern"
        title="Audit log"
        lede="Every fix proposed, approved, rejected and run, how it turned out, and every change to who can do what. Records are only ever added, and each carries the hash of the one before it, so a change made behind OpsPilot's back shows up here."
      />
      <ChainStatus query={chain} />

      <div className={styles.filters} role="group" aria-label="Filter the audit log">
        <Field label="Incident">
          <input
            type="number"
            min={1}
            placeholder="Any"
            value={incident}
            onChange={(event) => setFilter('incident', event.target.value)}
          />
        </Field>
        <Field label="Event">
          <select value={type} onChange={(event) => setFilter('type', event.target.value)}>
            <option value="">Any</option>
            {Object.entries(EVENTS).map(([value, { label }]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </Field>
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
                  <div className={styles.more}>
                    <Button variant="ghost" onClick={() => setPages(pages + 1)}>
                      Show older records
                    </Button>
                  </div>
                )}
              </>
            )
          }
        </QueryState>
      </Panel>
    </div>
  );
}

// The seal: every record checked against the hash of the one before it.
function ChainStatus({ query }) {
  const result = query.data;
  const title = !result
    ? 'Checking the chain…'
    : result.intact
      ? 'Chain intact'
      : `Chain broken at record ${result.brokenAt}`;
  const detail = !result
    ? 'Recomputing every hash from the first record.'
    : result.intact
      ? `${result.records === 1 ? 'The record matches its hash' : `All ${plural(result.records, 'record')} match their hashes`}: none was changed or removed outside OpsPilot.`
      : 'A record was changed or removed outside OpsPilot.';

  return (
    <section className={styles.chain} data-intact={result ? result.intact : undefined} aria-live="polite">
      <span className={styles.seal}>
        <ShieldIcon size={22} />
      </span>
      <div className={styles.chainText}>
        <p className={styles.chainTitle}>{title}</p>
        <p className={styles.chainDetail}>{detail}</p>
        {result?.head && <p className={styles.head}>head {result.head}</p>}
      </div>
      <Button size="sm" onClick={() => query.refetch()} disabled={query.isFetching}>
        {query.isFetching ? 'Checking…' : 'Check again'}
      </Button>
    </section>
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
            <th scope="col">Subject</th>
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
                  {row.type.startsWith('user.') && row.data.user}
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
  if (type === 'user.role_changed') return `${data.from} → ${data.to}`;
  if (type === 'user.created') return `as ${data.role}`;
  if (type === 'user.removed') return `was ${data.role}`;
  if (data.error) return `${data.stage}: ${data.error}`;
  if (data.reason) return type === 'action.rejected' ? `“${data.reason}”` : data.reason;
  if (data.plan) return data.plan;
  if (data.seconds) return `in ${data.seconds}s`;
  if (data.samples) return `${data.samples} measurements`;
  if (data.services) return `watching ${data.services.join(', ')}`;
  return '';
}
