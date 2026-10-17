import { lazy, Suspense } from 'react';
import { useParams } from 'react-router';
import { useActions, useIncident, useIncidentMetrics, useIncidentTopology, useTimeline } from '../lib/queries.js';
import { useNow } from '../hooks/useNow.js';
import { HoverTimeProvider } from '../charts/HoverTime.jsx';
import { Panel } from '../components/Panel.jsx';
import { ErrorState, Loading, QueryState } from '../components/States.jsx';
import { IncidentHeader } from '../incident/IncidentHeader.jsx';
import { SectionNav } from '../incident/SectionNav.jsx';
import { SignalsPanel } from '../incident/SignalsPanel.jsx';
import { BlastRadiusPanel } from '../incident/BlastRadiusPanel.jsx';
import { Timeline } from '../incident/Timeline.jsx';
import { AlertsTable } from '../incident/AlertsTable.jsx';
import { InvestigationPanel } from '../incident/InvestigationPanel.jsx';
import { RemediationPanel } from '../incident/RemediationPanel.jsx';
import { SimilarIncidentsPanel } from '../incident/SimilarIncidentsPanel.jsx';
import { RunbooksPanel } from '../incident/RunbooksPanel.jsx';
import styles from './IncidentPage.module.css';

// Only resolved incidents have a postmortem, and it brings a Markdown renderer, so it loads
// when one is shown.
const PostmortemPanel = lazy(() =>
  import('../incident/PostmortemPanel.jsx').then((module) => ({ default: module.PostmortemPanel })),
);

export function IncidentPage() {
  const number = Number(useParams().number);
  const incident = useIncident(number);
  const live = incident.data ? incident.data.status !== 'resolved' : false;
  const timeline = useTimeline(number);
  const topology = useIncidentTopology(number, live);
  const metrics = useIncidentMetrics(number, live);
  const actions = useActions(number);
  const now = useNow(1000);

  if (incident.isPending) return <Loading label="Loading incident" />;
  if (incident.isError) return <ErrorState error={incident.error} onRetry={() => incident.refetch()} />;

  const resolved = incident.data.status === 'resolved';
  const changes = (timeline.data ?? []).filter((entry) => entry.kind === 'change');
  const waiting = (actions.data ?? []).filter((action) => action.status === 'proposed').length;

  const sections = [
    { id: 'investigation', label: 'Investigation' },
    { id: 'remediation', label: 'Fix', badge: waiting || undefined },
    ...(resolved ? [{ id: 'postmortem', label: 'Postmortem' }] : []),
    { id: 'signals', label: 'Signals' },
    { id: 'blast-radius', label: 'Blast radius' },
    { id: 'knowledge', label: 'Similar and runbooks' },
    { id: 'alerts', label: `Alerts (${incident.data.alerts.length})` },
    { id: 'timeline', label: 'Timeline' },
  ];

  return (
    <HoverTimeProvider>
      <article className={styles.page}>
        <IncidentHeader incident={incident.data} now={now} />
        <SectionNav sections={sections} />
        <InvestigationPanel number={number} resolved={resolved} />
        <RemediationPanel incident={incident.data} />
        {resolved && (
          <Suspense
            fallback={
              <Panel title="Postmortem">
                <Loading label="Loading the postmortem" />
              </Panel>
            }
          >
            <PostmortemPanel incident={incident.data} />
          </Suspense>
        )}

        <div className={styles.layout}>
          <div className={styles.main}>
            <SignalsPanel metrics={metrics} incident={incident.data} changes={changes} now={now} />
            <BlastRadiusPanel topology={topology} live={live} />
            <div className={styles.knowledge} id="knowledge">
              <SimilarIncidentsPanel number={number} />
              <RunbooksPanel number={number} />
            </div>
            <Panel title="Alerts" meta={`${incident.data.alerts.length} in this incident`} flush id="alerts">
              <AlertsTable alerts={incident.data.alerts} now={now} />
            </Panel>
          </div>

          <Panel title="Timeline" meta="hover to line up with the charts" className={styles.side} flush id="timeline">
            <QueryState query={timeline} loadingLabel="Building the timeline">
              {(entries) => <Timeline entries={entries} />}
            </QueryState>
          </Panel>
        </div>
      </article>
    </HoverTimeProvider>
  );
}
