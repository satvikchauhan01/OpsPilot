import { useState } from 'react';
import { canRespond, useAuth } from '../auth/AuthContext.jsx';
import { useActions, useIncidentStatus, useInvestigation, usePostmortem } from '../lib/queries.js';
import { clock, dateTime, duration, incidentId, timeAgo } from '../lib/format.js';
import { useConsole } from '../layout/ConsoleContext.js';
import { Button, ButtonLink } from '../components/Button.jsx';
import { Field } from '../components/Field.jsx';
import { SeverityTag, ServiceChip, StatusTag } from '../components/Tags.jsx';
import { LinkIcon, ReplayIcon } from '../components/Icons.jsx';
import { Journey } from './Journey.jsx';
import { journeyOf } from './journey.js';
import styles from './IncidentHeader.module.css';

const NEXT = {
  open: ['investigating', 'mitigating', 'resolved'],
  investigating: ['mitigating', 'resolved'],
  mitigating: ['investigating', 'resolved'],
  resolved: [],
};
const ACTION_LABEL = { investigating: 'Start investigating', mitigating: 'Mark mitigating', resolved: 'Resolve' };

export function IncidentHeader({ incident, now }) {
  const { user } = useAuth();
  const { toast } = useConsole();
  const investigation = useInvestigation(incident.number);
  const actions = useActions(incident.number);
  const postmortem = usePostmortem(incident.number);
  const resolved = incident.status === 'resolved';
  const ended = incident.resolvedAt ? new Date(incident.resolvedAt) : now;
  const others = incident.services.filter((service) => service !== incident.suspectedService);

  const steps = journeyOf({
    incident,
    investigation: investigation.data,
    actions: actions.data,
    postmortem: postmortem.data,
  });

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(window.location.href.split('#')[0]);
      toast({
        tone: 'ok',
        title: 'Link copied',
        detail: `Anyone signed in can open ${incidentId(incident.number)} with it.`,
      });
    } catch {
      toast({ tone: 'warning', title: 'Could not copy the link', detail: 'Copy it from the address bar instead.' });
    }
  }

  return (
    <header className={styles.header}>
      <div className={styles.top}>
        <div className={styles.idLine}>
          <span className={styles.id}>{incidentId(incident.number)}</span>
          <SeverityTag severity={incident.severity} />
          <StatusTag status={incident.status} />
        </div>
        <div className={styles.tools}>
          <Button variant="ghost" size="sm" onClick={copyLink}>
            <LinkIcon size={14} /> Copy link
          </Button>
          <ButtonLink to={`/incidents/${incident.number}/replay`} size="sm">
            <ReplayIcon size={14} /> Replay
          </ButtonLink>
        </div>
      </div>

      <h1 className={styles.title}>{incident.title}</h1>

      <dl className={styles.facts}>
        <div>
          <dt>Started</dt>
          <dd title={dateTime(incident.startedAt)}>
            <span>
              <span className="mono">{clock(incident.startedAt)}</span> · {timeAgo(incident.startedAt, now)}
            </span>
          </dd>
        </div>
        <div>
          <dt>{resolved ? 'Lasted' : 'Ongoing for'}</dt>
          <dd className={styles.big}>{duration(ended - new Date(incident.startedAt))}</dd>
        </div>
        <div>
          <dt>Likely origin</dt>
          <dd>{incident.suspectedService ? <ServiceChip service={incident.suspectedService} emphasis /> : '—'}</dd>
        </div>
        {others.length > 0 && (
          <div>
            <dt>Also affected</dt>
            <dd className={styles.chips}>
              {others.map((service) => (
                <ServiceChip key={service} service={service} />
              ))}
            </dd>
          </div>
        )}
        <div>
          <dt>Alerts</dt>
          <dd className="mono">
            {incident.alerts.length} · {incident.alerts.filter((alert) => alert.status === 'firing').length} firing
          </dd>
        </div>
      </dl>

      <Journey steps={steps} startedAt={incident.startedAt} />

      {canRespond(user) && NEXT[incident.status].length > 0 && <StatusActions incident={incident} />}
    </header>
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
        <Field label="What fixed it? (optional)" grow>
          <input name="note" maxLength={500} placeholder="e.g. rolled checkout back to 1.4.1" autoFocus />
        </Field>
        <Button type="submit" variant="primary" disabled={mutation.isPending}>
          Resolve incident
        </Button>
        <Button onClick={() => setResolving(false)}>Cancel</Button>
      </form>
    );
  }

  return (
    <div className={styles.actions}>
      <span className={styles.actionsLabel}>Status</span>
      {NEXT[incident.status].map((status) => (
        <Button
          key={status}
          size="sm"
          variant={status === 'resolved' ? 'primary' : 'secondary'}
          disabled={mutation.isPending}
          onClick={() => (status === 'resolved' ? setResolving(true) : mutation.mutate({ status }))}
        >
          {ACTION_LABEL[status]}
        </Button>
      ))}
      {mutation.isError && (
        <span className={styles.error} role="alert">
          {mutation.error.message}
        </span>
      )}
    </div>
  );
}
