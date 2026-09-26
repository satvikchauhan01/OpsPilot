import { useState } from 'react';
import { Link } from 'react-router';
import { canRespond, useAuth } from '../auth/AuthContext.jsx';
import {
  useActions,
  useApproveAction,
  useInvestigation,
  useProposeAction,
  useRejectAction,
  useRemediationStatus,
  useServices,
} from '../lib/queries.js';
import { ACTION_LABEL, ACTION_STATUS_LABEL } from '../lib/labels.js';
import { clock, duration, latency, percent, timeAgo } from '../lib/format.js';
import { useNow } from '../hooks/useNow.js';
import { Panel } from '../components/Panel.jsx';
import { Empty, QueryState } from '../components/States.jsx';
import { ServiceChip, ToneMark } from '../components/Tags.jsx';
import styles from './RemediationPanel.module.css';

const ACTION_TYPES = ['rollback', 'restart', 'scale'];
const IN_FLIGHT = ['approved', 'running', 'verifying'];

export function RemediationPanel({ incident }) {
  const { user } = useAuth();
  const actions = useActions(incident.number);
  const status = useRemediationStatus();
  const investigation = useInvestigation(incident.number);
  const [proposing, setProposing] = useState(false);

  const list = actions.data ?? [];
  // The fix that matters most: one waiting or running, else the latest.
  const current = list.find((action) => action.status === 'proposed' || IN_FLIGHT.includes(action.status)) ?? list[0];
  const busy = IN_FLIGHT.includes(current?.status);
  const canPropose = canRespond(user) && incident.status !== 'resolved' && !busy;

  const toggle = canPropose && (
    <button
      type="button"
      className={styles.secondary}
      onClick={() => setProposing(!proposing)}
      aria-expanded={proposing}
    >
      {proposing ? 'Cancel' : 'Propose a different fix'}
    </button>
  );

  return (
    <Panel title="Remediation" meta={current && ACTION_STATUS_LABEL[current.status]} actions={toggle}>
      <div className={styles.body}>
        {status.data && !status.data.enabled && (
          <p className={styles.notice}>OpsPilot can propose fixes but not run them. {status.data.reason}</p>
        )}
        {proposing && (
          <ProposeForm
            incident={incident}
            maxReplicas={status.data?.maxReplicas ?? 6}
            onDone={() => setProposing(false)}
          />
        )}
        <QueryState query={actions} loadingLabel="Loading fixes">
          {() =>
            current ? (
              <>
                <ActionCard action={current} incident={incident} status={status.data} responder={canRespond(user)} />
                <History actions={list.filter((action) => action !== current)} />
              </>
            ) : (
              <NoFixYet
                incident={incident}
                investigating={['queued', 'running'].includes(investigation.data?.status)}
              />
            )
          }
        </QueryState>
      </div>
    </Panel>
  );
}

function NoFixYet({ incident, investigating }) {
  if (incident.status === 'resolved') {
    return <Empty title="No fix was run">This incident ended without one.</Empty>;
  }
  if (investigating) {
    return <Empty title="Waiting for the root cause">The investigation proposes a fix as soon as it finds one.</Empty>;
  }
  return (
    <Empty title="No fix proposed">
      The AI proposes one when it finds a root cause it knows how to fix. A responder can propose one too.
    </Empty>
  );
}

function ActionCard({ action, incident, status, responder }) {
  const now = useNow(1000);
  const decided = action.status === 'rejected' ? 'Rejected' : 'Approved';

  return (
    <article className={styles.card} data-status={action.status}>
      <header className={styles.cardHead}>
        <span className={styles.verb}>{ACTION_LABEL[action.type]}</span>
        <span className={styles.plan}>{action.plan.summary}</span>
        <StatusTag status={action.status} />
      </header>

      <dl className={styles.facts}>
        {action.reason && (
          <div>
            <dt>Why</dt>
            <dd>{action.reason}</dd>
          </div>
        )}
        {action.runbook && (
          <div>
            <dt>Runbook</dt>
            <dd>
              <Link to={`/runbooks/${action.runbook.slug}#${action.runbook.anchor}`}>
                {action.runbook.title} › {action.runbook.heading}
              </Link>
            </dd>
          </div>
        )}
        <div>
          <dt>Proposed</dt>
          <dd>
            by {action.proposedBy}, {timeAgo(action.proposedAt, now)}
          </dd>
        </div>
        {action.decidedBy && (
          <div>
            <dt>{decided}</dt>
            <dd>
              by {action.decidedBy} at {clock(action.decidedAt)}
              {action.rejectionReason && <span className={styles.quote}> “{action.rejectionReason}”</span>}
            </dd>
          </div>
        )}
      </dl>

      {action.status === 'proposed' && (
        <Decision action={action} incident={incident} status={status} responder={responder} />
      )}
      {(IN_FLIGHT.includes(action.status) || action.status === 'verified' || action.status === 'failed') && (
        <Progress action={action} now={now} />
      )}
      {action.verification?.samples?.length > 0 && status && (
        <Measurements verification={action.verification} thresholds={status.thresholds} />
      )}
      {action.status === 'verified' && (
        <p className={styles.success}>
          Every service of the incident stayed within its limits for the last minute of the check. The incident closes
          itself once its alerts have been quiet for 5 minutes.
        </p>
      )}
      {action.status === 'failed' && (
        <p className={styles.failure}>
          {action.failedStage === 'verification' ? 'The fix ran, but ' : ''}
          {action.error}
          {action.failedStage !== 'interrupted' && '. The incident went back to investigating.'}
        </p>
      )}
    </article>
  );
}

function StatusTag({ status }) {
  return (
    <span className={styles.status} data-status={status}>
      {ACTION_STATUS_LABEL[status]}
    </span>
  );
}

// What approving will do, in plain words, shown once more before it runs.
function consequence({ type, plan }, minutes) {
  const then = ` Then OpsPilot watches the incident's metrics for ${minutes} minutes.`;
  if (type === 'rollback') {
    return `Rolls ${plan.service} back from ${plan.from.version} to ${plan.to.version}, replacing its ${plan.replicas} pods one at a time.${then}`;
  }
  if (type === 'restart') {
    return `Replaces the ${plan.replicas} ${plan.service} pods one at a time; each new pod has to be ready before the next old one stops.${then}`;
  }
  return `Changes ${plan.service} from ${plan.from.replicas} to ${plan.to.replicas} replicas.${then}`;
}

function Decision({ action, incident, status, responder }) {
  const approve = useApproveAction(incident.number);
  const reject = useRejectAction(incident.number);
  const [step, setStep] = useState(null);
  const [reason, setReason] = useState('');

  if (!responder) return <p className={styles.muted}>A responder has to approve this before it runs.</p>;
  const error = approve.error ?? reject.error;

  return (
    <div className={styles.decision}>
      {step === null && (
        <div className={styles.buttons}>
          <button
            type="button"
            className={styles.primary}
            disabled={!status?.enabled}
            onClick={() => setStep('confirm')}
          >
            Approve and run
          </button>
          <button type="button" className={styles.secondary} onClick={() => setStep('reject')}>
            Reject
          </button>
        </div>
      )}

      {step === 'confirm' && (
        <div className={styles.confirm}>
          <p>{consequence(action, status?.verificationWindowMinutes ?? 3)}</p>
          <div className={styles.buttons}>
            <button
              type="button"
              className={styles.danger}
              disabled={approve.isPending}
              onClick={() => approve.mutate(action.id, { onSettled: () => setStep(null) })}
            >
              {approve.isPending ? 'Starting…' : `${ACTION_LABEL[action.type]} now`}
            </button>
            <button type="button" className={styles.secondary} onClick={() => setStep(null)}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {step === 'reject' && (
        <form
          className={styles.rejectForm}
          onSubmit={(event) => {
            event.preventDefault();
            reject.mutate({ id: action.id, reason }, { onSuccess: () => setStep(null) });
          }}
        >
          <label htmlFor={`reject-${action.id}`}>Why not? This goes into the audit log.</label>
          <textarea
            id={`reject-${action.id}`}
            required
            minLength={3}
            maxLength={500}
            rows={2}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
          />
          <div className={styles.buttons}>
            <button type="submit" className={styles.primary} disabled={reject.isPending}>
              Reject the fix
            </button>
            <button type="button" className={styles.secondary} onClick={() => setStep(null)}>
              Cancel
            </button>
          </div>
        </form>
      )}

      {error && <p className={styles.error}>{error.message}</p>}
    </div>
  );
}

function Progress({ action, now }) {
  const failedAt = action.status === 'failed' ? action.failedStage : null;
  const rollout = action.rollout;
  const verification = action.verification;

  const steps = [
    { label: `Approved by ${action.decidedBy}`, state: 'done', at: action.decidedAt },
    {
      label: action.rolledOutAt
        ? `Rolled out in ${duration(new Date(action.rolledOutAt) - new Date(action.startedAt))}`
        : failedAt === 'execution' || failedAt === 'interrupted'
          ? 'Rollout failed'
          : rollout
            ? `Rolling out: ${rollout.updated} of ${rollout.wanted} pods updated`
            : 'Starting the rollout',
      state: action.rolledOutAt
        ? 'done'
        : failedAt
          ? 'failed'
          : action.status === 'approved' || action.status === 'running'
            ? 'active'
            : 'waiting',
      at: action.rolledOutAt,
    },
    {
      label:
        action.status === 'verified'
          ? 'Verified'
          : failedAt === 'verification'
            ? 'Verification failed'
            : action.status === 'verifying'
              ? `Verifying: ${duration(Math.max(0, new Date(verification.endsAt) - now))} left`
              : 'Verify the metrics',
      state:
        action.status === 'verified'
          ? 'done'
          : failedAt === 'verification'
            ? 'failed'
            : action.status === 'verifying'
              ? 'active'
              : 'waiting',
      at: action.status === 'verified' || failedAt === 'verification' ? action.finishedAt : undefined,
    },
  ];

  return (
    <ol className={styles.progress} aria-label="Progress of the fix">
      {steps.map((step) => (
        <li key={step.label} data-state={step.state}>
          <span className={styles.dot} aria-hidden="true" />
          <span>{step.label}</span>
          {step.at && <time className={styles.stepTime}>{clock(step.at)}</time>}
        </li>
      ))}
    </ol>
  );
}

function formatValue(metric, value) {
  return metric === 'p95' ? latency(value) : percent(value);
}

function Measurements({ verification, thresholds }) {
  const latest = verification.samples.at(-1);
  const metrics = Object.entries(thresholds);
  return (
    <div className={styles.tableWrap}>
      <table className={styles.measurements}>
        <caption>
          Measured at {clock(latest.at)}. Only the last minute of the check decides, from{' '}
          {clock(verification.judgeFrom)}.
        </caption>
        <thead>
          <tr>
            <th scope="col">Service</th>
            {metrics.map(([metric, { label, max }]) => (
              <th key={metric} scope="col">
                {label}
                <span className={styles.limit}>limit {formatValue(metric, max)}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {verification.services.map((service) => (
            <tr key={service}>
              <th scope="row">
                <ServiceChip service={service} />
              </th>
              {metrics.map(([metric, { max }]) => {
                const value = latest.values[service]?.[metric];
                if (value === null || value === undefined) {
                  return (
                    <td key={metric} className={styles.muted}>
                      —
                    </td>
                  );
                }
                const over = value > max;
                return (
                  <td key={metric} data-over={over || undefined}>
                    <ToneMark tone={over ? 'critical' : 'ok'} />
                    {formatValue(metric, value)}
                    <span className="visually-hidden">{over ? ' over the limit' : ' within the limit'}</span>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function History({ actions }) {
  if (actions.length === 0) return null;
  return (
    <details className={styles.history}>
      <summary>Earlier fixes ({actions.length})</summary>
      <ol>
        {actions.map((action) => (
          <li key={action.id}>
            <StatusTag status={action.status} />
            <span>
              {ACTION_LABEL[action.type]} {action.plan.summary}
            </span>
            <span className={styles.muted}>
              {action.decidedBy ?? action.proposedBy}, {clock(action.decidedAt ?? action.proposedAt)}
              {action.rejectionReason && ` · “${action.rejectionReason}”`}
              {action.error && ` · ${action.error}`}
            </span>
          </li>
        ))}
      </ol>
    </details>
  );
}

function ProposeForm({ incident, maxReplicas, onDone }) {
  const propose = useProposeAction(incident.number);
  const services = useServices();
  const deployments = services.data?.services.filter((row) => row.workload).map((row) => row.name) ?? incident.services;
  const [type, setType] = useState('rollback');
  const [service, setService] = useState(incident.suspectedService ?? incident.services[0]);
  const [replicas, setReplicas] = useState(4);
  const [reason, setReason] = useState('');

  return (
    <form
      className={styles.propose}
      onSubmit={(event) => {
        event.preventDefault();
        propose.mutate(
          { type, service, ...(type === 'scale' && { replicas: Number(replicas) }), reason: reason || undefined },
          { onSuccess: onDone },
        );
      }}
    >
      <label>
        <span className="caption">Fix</span>
        <select value={type} onChange={(event) => setType(event.target.value)}>
          {ACTION_TYPES.map((option) => (
            <option key={option} value={option}>
              {ACTION_LABEL[option]}
            </option>
          ))}
        </select>
      </label>
      <label>
        <span className="caption">Service</span>
        <select value={service} onChange={(event) => setService(event.target.value)}>
          {deployments.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
      </label>
      {type === 'scale' && (
        <label>
          <span className="caption">Replicas</span>
          <input
            type="number"
            min={1}
            max={maxReplicas}
            required
            value={replicas}
            onChange={(event) => setReplicas(event.target.value)}
          />
        </label>
      )}
      <label className={styles.grow}>
        <span className="caption">Why</span>
        <input
          type="text"
          maxLength={500}
          placeholder="Optional, shown to whoever approves it"
          value={reason}
          onChange={(event) => setReason(event.target.value)}
        />
      </label>
      <button type="submit" className={styles.primary} disabled={propose.isPending}>
        Propose
      </button>
      {propose.error && <p className={styles.error}>{propose.error.message}</p>}
    </form>
  );
}
