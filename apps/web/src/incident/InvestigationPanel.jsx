import { useState } from 'react';
import { canRespond, useAuth } from '../auth/AuthContext.jsx';
import { useAiStatus, useInvestigation, useStartInvestigation } from '../lib/queries.js';
import { clock, duration } from '../lib/format.js';
import { useNow } from '../hooks/useNow.js';
import { Panel } from '../components/Panel.jsx';
import { Empty, QueryState } from '../components/States.jsx';
import { ServiceChip } from '../components/Tags.jsx';
import styles from './InvestigationPanel.module.css';

const CAUSE_LABEL = {
  bad_deploy: 'Bad deploy',
  config_change: 'Config change',
  memory_leak: 'Memory leak',
  resource_saturation: 'Saturation',
  traffic_surge: 'Traffic surge',
  slow_dependency: 'Slow dependency',
  crash_loop: 'Crash loop',
  unknown: 'Unknown',
};

const ACTION_LABEL = {
  rollback: 'Roll back',
  restart: 'Restart',
  scale_up: 'Scale up',
  investigate: 'Keep investigating',
  none: 'No action',
};

const STATUS_LABEL = { queued: 'Queued', running: 'Investigating', completed: 'Done', failed: 'Failed' };

export function InvestigationPanel({ number }) {
  const { user } = useAuth();
  const ai = useAiStatus();
  const investigation = useInvestigation(number);
  const start = useStartInvestigation(number);
  const now = useNow(1000);
  const [openEvidence, setOpenEvidence] = useState(null);

  const run = investigation.data;
  const busy = run?.status === 'queued' || run?.status === 'running';
  const canStart = canRespond(user) && ai.data?.enabled && !busy;

  const elapsed = run?.startedAt ? (run.finishedAt ? new Date(run.finishedAt) : now) - new Date(run.startedAt) : null;
  const meta = run
    ? [
        STATUS_LABEL[run.status],
        run.model,
        elapsed !== null && duration(elapsed),
        `${run.usage?.requests ?? 0} model calls`,
      ]
        .filter(Boolean)
        .join(' · ')
    : ai.data && !ai.data.enabled
      ? 'off'
      : undefined;

  const actions = canStart && (
    <button type="button" className={styles.run} onClick={() => start.mutate()} disabled={start.isPending}>
      {run ? 'Investigate again' : 'Investigate now'}
    </button>
  );

  return (
    <Panel title="AI investigation" meta={meta} actions={actions} className={styles.panel}>
      <QueryState query={investigation} loadingLabel="Loading the investigation">
        {(current) => {
          if (!current) {
            return ai.data && !ai.data.enabled ? (
              <Empty title="AI investigation is switched off">
                Add a Gemini API key (GEMINI_API_KEY) to the server's settings to turn it on.
              </Empty>
            ) : (
              <Empty title="Not investigated yet">
                New incidents are investigated automatically about a minute after they open.
              </Empty>
            );
          }

          const evidence = new Map(current.evidence.map((item) => [item.id, item]));
          return (
            <div className={styles.layout}>
              <div className={styles.findings}>
                {start.isError && <p className={styles.error}>{start.error.message}</p>}
                {current.status === 'completed' && current.result ? (
                  <Findings
                    result={current.result}
                    evidence={evidence}
                    openEvidence={openEvidence}
                    onOpen={setOpenEvidence}
                  />
                ) : current.status === 'failed' ? (
                  <p className={styles.error}>The investigation stopped: {current.error}</p>
                ) : (
                  <Working status={current.status} steps={current.steps.length} />
                )}
                {openEvidence && evidence.has(openEvidence) && (
                  <EvidenceDetail item={evidence.get(openEvidence)} onClose={() => setOpenEvidence(null)} />
                )}
              </div>

              <Steps
                steps={current.steps}
                startedAt={current.startedAt}
                onOpen={setOpenEvidence}
                openEvidence={openEvidence}
              />
            </div>
          );
        }}
      </QueryState>
    </Panel>
  );
}

function Working({ status, steps }) {
  return (
    <div className={styles.working} role="status">
      <span className={styles.pulse} aria-hidden="true" />
      <div>
        <p className={styles.workingTitle}>{status === 'queued' ? 'Waiting for its turn' : 'Reading the evidence'}</p>
        <p className={styles.muted}>
          {status === 'queued'
            ? 'Investigations run one at a time to stay within the model quota.'
            : `${steps} steps so far. Findings appear here when the investigation is done.`}
        </p>
      </div>
    </div>
  );
}

function Findings({ result, evidence, openEvidence, onOpen }) {
  return (
    <>
      <p className={styles.summary}>{result.summary}</p>
      <ol className={styles.hypotheses}>
        {result.hypotheses.map((hypothesis, index) => (
          <li key={hypothesis.title} className={styles.hypothesis} data-rank={index + 1}>
            <div className={styles.hypothesisHead}>
              <span className={styles.rank}>{index + 1}</span>
              <div className={styles.hypothesisTitle}>
                <p>{hypothesis.title}</p>
                <div className={styles.hypothesisMeta}>
                  <ServiceChip service={hypothesis.service} emphasis />
                  <span className={styles.cause}>{CAUSE_LABEL[hypothesis.causeType] ?? hypothesis.causeType}</span>
                  <span className={styles.action}>Suggests: {ACTION_LABEL[hypothesis.suggestedAction]}</span>
                </div>
              </div>
              <Confidence value={hypothesis.confidence} />
            </div>
            <p className={styles.reasoning}>{hypothesis.reasoning}</p>
            <ul className={styles.evidenceList}>
              {hypothesis.evidence.map(({ id, finding }) => (
                <li key={`${id}-${finding}`}>
                  <button
                    type="button"
                    className={styles.evidenceChip}
                    aria-pressed={openEvidence === id}
                    onClick={() => onOpen(openEvidence === id ? null : id)}
                    title={evidence.get(id)?.title}
                  >
                    {id}
                  </button>
                  <span>{finding}</span>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ol>
    </>
  );
}

function Confidence({ value }) {
  const percent = Math.round(value * 100);
  return (
    <span className={styles.confidence}>
      <span className={styles.confidenceValue}>{percent}%</span>
      <span
        className={styles.confidenceTrack}
        role="meter"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        aria-label="Confidence"
      >
        <span style={{ width: `${percent}%` }} />
      </span>
    </span>
  );
}

function EvidenceDetail({ item, onClose }) {
  return (
    <section className={styles.evidenceDetail} aria-label={`Evidence ${item.id}`}>
      <header>
        <span className={styles.evidenceId}>{item.id}</span>
        <span className={styles.evidenceTitle}>{item.title}</span>
        <button type="button" className={styles.close} onClick={onClose}>
          Close
        </button>
      </header>
      <p className={styles.muted}>
        Tool <span className="mono">{item.tool}</span> at {clock(item.at)}
        {Object.keys(item.args ?? {}).length > 0 && (
          <>
            {' '}
            with <span className="mono">{JSON.stringify(item.args)}</span>
          </>
        )}
      </p>
      <pre className={styles.json}>{JSON.stringify(item.result, null, 2)}</pre>
    </section>
  );
}

function Steps({ steps, startedAt, onOpen, openEvidence }) {
  const start = startedAt ? new Date(startedAt).getTime() : null;
  return (
    <ol className={styles.steps} aria-label="Investigation steps" aria-live="polite">
      {steps.map((step, index) => (
        <li key={index} className={styles.step} data-kind={step.kind} data-status={step.status}>
          <span className={styles.stepTime}>
            {start ? `+${Math.max(0, Math.round((new Date(step.at) - start) / 1000))}s` : ''}
          </span>
          <span className={styles.stepMark} aria-hidden="true" />
          <span className={styles.stepBody}>
            <span className={styles.stepTitle}>{step.title}</span>
            {step.evidenceId && (
              <button
                type="button"
                className={styles.evidenceChip}
                aria-pressed={openEvidence === step.evidenceId}
                onClick={() => onOpen(openEvidence === step.evidenceId ? null : step.evidenceId)}
              >
                {step.evidenceId}
              </button>
            )}
            {step.durationMs !== undefined && (
              <span className={styles.stepDuration}>{(step.durationMs / 1000).toFixed(1)}s</span>
            )}
          </span>
        </li>
      ))}
    </ol>
  );
}
