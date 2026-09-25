import { useState } from 'react';
import { Link } from 'react-router';
import { canRespond, useAuth } from '../auth/AuthContext.jsx';
import { useIncidentStatus } from '../lib/queries.js';
import { clock, dateTime, duration, incidentId, timeAgo } from '../lib/format.js';
import { SeverityTag, ServiceChip } from '../components/Tags.jsx';
import styles from './IncidentHeader.module.css';

const STEPS = ['open', 'investigating', 'mitigating', 'resolved'];
const STEP_LABEL = { open: 'Open', investigating: 'Investigating', mitigating: 'Mitigating', resolved: 'Resolved' };
const NEXT = {
  open: ['investigating', 'mitigating', 'resolved'],
  investigating: ['mitigating', 'resolved'],
  mitigating: ['investigating', 'resolved'],
  resolved: [],
};
const ACTION_LABEL = { investigating: 'Start investigating', mitigating: 'Mark mitigating', resolved: 'Resolve' };

export function IncidentHeader({ incident, now }) {
  const { user } = useAuth();
  const ended = incident.resolvedAt ? new Date(incident.resolvedAt) : now;
  const others = incident.services.filter((service) => service !== incident.suspectedService);

  return (
    <header className={styles.header}>
      <Link to="/incidents" className={styles.back}>
        ← Incidents
      </Link>

      <div className={styles.idLine}>
        <span className={styles.id}>{incidentId(incident.number)}</span>
        <SeverityTag severity={incident.severity} />
        <StatusSteps status={incident.status} />
      </div>

      <h1 className={styles.title}>{incident.title}</h1>

      <dl className={styles.facts}>
        <div>
          <dt className="caption">Started</dt>
          <dd title={dateTime(incident.startedAt)}>
            <span className="mono">{clock(incident.startedAt)}</span> · {timeAgo(incident.startedAt, now)}
          </dd>
        </div>
        <div>
          <dt className="caption">{incident.resolvedAt ? 'Lasted' : 'Ongoing for'}</dt>
          <dd className="mono numeric">{duration(ended - new Date(incident.startedAt))}</dd>
        </div>
        <div>
          <dt className="caption">Likely origin</dt>
          <dd>{incident.suspectedService ? <ServiceChip service={incident.suspectedService} emphasis /> : '—'}</dd>
        </div>
        {others.length > 0 && (
          <div>
            <dt className="caption">Also affected</dt>
            <dd className={styles.chips}>
              {others.map((service) => (
                <ServiceChip key={service} service={service} />
              ))}
            </dd>
          </div>
        )}
      </dl>

      {canRespond(user) && NEXT[incident.status].length > 0 && <StatusActions incident={incident} />}
    </header>
  );
}

function StatusSteps({ status }) {
  const reached = STEPS.indexOf(status);
  return (
    <ol className={styles.steps} aria-label={`Status: ${STEP_LABEL[status]}`}>
      {STEPS.map((step, index) => (
        <li
          key={step}
          data-state={index < reached ? 'done' : index === reached ? 'current' : 'todo'}
          aria-current={index === reached ? 'step' : undefined}
        >
          {STEP_LABEL[step]}
        </li>
      ))}
    </ol>
  );
}

function StatusActions({ incident }) {
  const mutation = useIncidentStatus(incident.number);
  const [resolving, setResolving] = useState(false);

  if (resolving) {
    return (
      <form
        className={styles.resolveForm}
        onSubmit={(event) => {
          event.preventDefault();
          const note = new FormData(event.currentTarget).get('note');
          mutation.mutate({ status: 'resolved', note }, { onSuccess: () => setResolving(false) });
        }}
      >
        <label className={styles.noteField}>
          <span className="caption">What fixed it? (optional)</span>
          <input name="note" maxLength={500} placeholder="e.g. rolled checkout back to 1.4.1" autoFocus />
        </label>
        <button type="submit" className={styles.primary} disabled={mutation.isPending}>
          Resolve incident
        </button>
        <button type="button" className={styles.secondary} onClick={() => setResolving(false)}>
          Cancel
        </button>
      </form>
    );
  }

  return (
    <div className={styles.actions}>
      {NEXT[incident.status].map((status) => (
        <button
          key={status}
          type="button"
          className={status === 'resolved' ? styles.primary : styles.secondary}
          disabled={mutation.isPending}
          onClick={() => (status === 'resolved' ? setResolving(true) : mutation.mutate({ status }))}
        >
          {ACTION_LABEL[status]}
        </button>
      ))}
      {mutation.isError && (
        <span className={styles.error} role="alert">
          {mutation.error.message}
        </span>
      )}
    </div>
  );
}
