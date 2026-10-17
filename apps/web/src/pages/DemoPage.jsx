import { Link } from 'react-router';
import { canRespond, isResponder, useAuth } from '../auth/AuthContext.jsx';
import {
  useActions,
  useAiStatus,
  useDemo,
  useIncidents,
  useInvestigation,
  usePostmortem,
  useResetDemo,
  useStartScenario,
} from '../lib/queries.js';
import { clock, duration, incidentId } from '../lib/format.js';
import { useNow } from '../hooks/useNow.js';
import { useConsole } from '../layout/ConsoleContext.js';
import { Button } from '../components/Button.jsx';
import { PageHeader } from '../components/PageHeader.jsx';
import { Panel } from '../components/Panel.jsx';
import { Empty, QueryState } from '../components/States.jsx';
import { SeverityTag, StatusTag } from '../components/Tags.jsx';
import { ArrowRightIcon, CompassIcon } from '../components/Icons.jsx';
import { journeyOf } from '../incident/journey.js';
import styles from './DemoPage.module.css';

// What happens after a scenario starts, in the order a visitor sees it. `step` names the
// journey step each one follows once the incident exists.
const FLOW = [
  { title: 'Break', detail: 'One click changes the real shop' },
  { title: 'Detect', detail: 'Alerts fire within about 2 minutes', step: 'detected' },
  { title: 'Investigate', detail: 'The AI works out the root cause', step: 'rootCause' },
  { title: 'Approve', detail: 'You approve the fix it proposes', step: 'approved' },
  { title: 'Verify', detail: 'OpsPilot checks the metrics recover', step: 'verified' },
  { title: 'Learn', detail: 'A postmortem is drafted', step: 'postmortem' },
];

const LOW_AI_BUDGET = 20;

export function DemoPage() {
  const demo = useDemo();
  const ai = useAiStatus();
  const { startTour } = useConsole();

  return (
    <div className={styles.page}>
      <div data-tour="demo-intro">
        <PageHeader
          kicker="Demo"
          title="Break the shop, watch it get fixed"
          lede="Behind this console runs a small online shop on Kubernetes: four services, real traffic, real alerts. Break it in one of four ways, then follow the incident OpsPilot opens, from the first alert to the verified fix and the postmortem."
          actions={
            <>
              {ai.data?.enabled && (
                <p className={styles.budget} data-low={ai.data.remainingToday < LOW_AI_BUDGET || undefined}>
                  <span className="caption">AI calls left today</span>
                  <span className={styles.budgetValue}>
                    {ai.data.remainingToday}
                    <span className={styles.budgetOf}> / {ai.data.dailyBudget}</span>
                  </span>
                </p>
              )}
              <Button variant="ghost" onClick={startTour}>
                <CompassIcon /> Take the tour
              </Button>
            </>
          }
        />
      </div>

      <QueryState query={demo} loadingLabel="Checking the shop">
        {(status) =>
          status.enabled ? (
            <DemoControls status={status} aiLow={ai.data?.enabled && ai.data.remainingToday < LOW_AI_BUDGET} />
          ) : (
            <Panel title="Scenarios">
              <Empty title="Demo control is off on this server">
                It needs the opspilot-demo service account's token (KUBE_DEMO_TOKEN). Locally, npm run cluster:up writes
                it into .env. The scenarios can still be started with npm run scenario.
              </Empty>
            </Panel>
          )
        }
      </QueryState>
    </div>
  );
}

function DemoControls({ status, aiLow }) {
  const { user } = useAuth();
  const start = useStartScenario();
  const now = useNow(1000);
  const incidents = useIncidents({ limit: 5 });
  const active = status.active && status.scenarios.find((scenario) => scenario.key === status.active.key);
  const settling = status.cooldownUntil && new Date(status.cooldownUntil) > now;
  const canStart = canRespond(user) && !active && !settling;
  // The incidents this scenario caused: any that started after it did, oldest first
  const caused = active
    ? (incidents.data ?? [])
        .filter((incident) => new Date(incident.startedAt) >= new Date(status.active.startedAt))
        .reverse()
    : [];

  return (
    <>
      <ShopStatus status={status} active={active} settling={settling} caused={caused} now={now} />
      <Flow running={Boolean(active)} incident={caused[0]} />

      <div data-tour="scenarios">
        <Panel title="Scenarios" meta="one at a time" flush>
          {aiLow && (
            <p className={styles.notice}>
              The AI has almost used up today's budget. Scenarios still run, but OpsPilot may not be able to investigate
              them until midnight UTC.
            </p>
          )}
          {!canRespond(user) && (
            <p className={styles.notice}>
              You can watch, but starting a scenario needs a responder or a guest session.
            </p>
          )}
          <ul className={styles.scenarios}>
            {status.scenarios.map((scenario) => (
              <li key={scenario.key} className={styles.scenario} data-active={scenario === active || undefined}>
                <span className={styles.scenarioId}>{scenario.id}</span>
                <div className={styles.scenarioText}>
                  <h2 className={styles.scenarioTitle}>{scenario.title}</h2>
                  <p>{scenario.breaks}</p>
                </div>
                <div className={styles.expected}>
                  <span className="caption">Expected</span>
                  <p>{scenario.expected}</p>
                </div>
                <div className={styles.scenarioAction}>
                  {scenario === active ? (
                    <span className={styles.running}>Running</span>
                  ) : (
                    <Button
                      variant="primary"
                      disabled={!canStart || start.isPending}
                      onClick={() => start.mutate(scenario.key)}
                      aria-label={`Start ${scenario.id}: ${scenario.title}`}
                    >
                      {start.isPending && start.variables === scenario.key ? 'Starting…' : 'Start'}
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
          {start.error && (
            <p className={styles.error} role="alert">
              {start.error.message}
            </p>
          )}
        </Panel>
      </div>
    </>
  );
}

// The six steps of a run. While a scenario runs, each lights up as its incident gets there.
function Flow({ running, incident }) {
  const number = incident?.number;
  const investigation = useInvestigation(number, Boolean(incident));
  const actions = useActions(number, Boolean(incident));
  const postmortem = usePostmortem(number, Boolean(incident));
  const steps = incident
    ? Object.fromEntries(
        journeyOf({
          incident,
          investigation: investigation.data,
          actions: actions.data,
          postmortem: postmortem.data,
        }).map((step) => [step.key, step.state]),
      )
    : {};

  function stateOf(item) {
    if (!running) return undefined;
    if (!item.step) return 'done';
    if (!incident) return item.step === 'detected' ? 'active' : undefined;
    return steps[item.step];
  }

  return (
    <ol
      className={styles.flow}
      aria-label="How a scenario plays out"
      data-tour="flow"
      data-running={running || undefined}
    >
      {FLOW.map((item, index) => {
        const state = stateOf(item);
        return (
          <li key={item.title} data-state={state}>
            <span className={styles.flowNumber}>{index + 1}</span>
            <span className={styles.flowTitle}>{item.title}</span>
            <span className={styles.flowDetail}>
              {state === 'waiting' && item.step === 'approved' ? 'Waiting for you to approve the fix' : item.detail}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function ShopStatus({ status, active, settling, caused, now }) {
  const { user } = useAuth();
  const reset = useResetDemo();

  if (active) {
    const left = new Date(status.active.resetAt) - now;
    return (
      <section className={styles.status} data-tone="critical" aria-live="polite">
        <span className={styles.statusMark} aria-hidden="true" />
        <div className={styles.statusText}>
          <p className={styles.headline}>
            <span className="mono">{active.id}</span> {active.title} is running
          </p>
          <p className={styles.subline}>
            Started by {status.active.by} at {clock(status.active.startedAt)}.{' '}
            {left > 0 ? (
              <>
                The shop puts itself back in <span className="mono numeric">{duration(left)}</span>.
              </>
            ) : (
              'Putting the shop back now.'
            )}
          </p>
          <ScenarioIncidents caused={caused} />
        </div>
        {isResponder(user) && (
          <div className={styles.statusAction}>
            <Button disabled={reset.isPending} onClick={() => reset.mutate()}>
              {reset.isPending ? 'Resetting…' : 'Reset now'}
            </Button>
            {reset.error && <p className={styles.error}>{reset.error.message}</p>}
          </div>
        )}
      </section>
    );
  }

  if (settling) {
    return (
      <section className={styles.status} data-tone="warning" aria-live="polite">
        <span className={styles.statusMark} aria-hidden="true" />
        <div className={styles.statusText}>
          <p className={styles.headline}>Settling after the last scenario</p>
          <p className={styles.subline}>
            Alerts need a moment to clear. The next scenario can start in{' '}
            <span className="mono numeric">{duration(new Date(status.cooldownUntil) - now)}</span>.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className={styles.status} data-tone="ok" aria-live="polite">
      <span className={styles.statusMark} aria-hidden="true" />
      <div className={styles.statusText}>
        <p className={styles.headline}>The shop is running normally</p>
        <p className={styles.subline}>
          Pick a scenario below. It runs for up to {status.resetMinutes} minutes, then the shop puts itself back.
        </p>
      </div>
    </section>
  );
}

function ScenarioIncidents({ caused }) {
  if (caused.length === 0) {
    return (
      <p className={styles.waiting}>
        <span className={styles.dots} aria-hidden="true" />
        Waiting for the first alert. The incident will appear here.
      </p>
    );
  }
  return (
    <ul className={styles.caused}>
      {caused.map((incident) => (
        <li key={incident.id}>
          <Link to={`/incidents/${incident.number}`} className={styles.incidentLink}>
            <span className="mono">{incidentId(incident.number)}</span>
            <SeverityTag severity={incident.severity} />
            <StatusTag status={incident.status} />
            <span className={styles.incidentTitle}>{incident.title}</span>
            <ArrowRightIcon />
          </Link>
        </li>
      ))}
    </ul>
  );
}
