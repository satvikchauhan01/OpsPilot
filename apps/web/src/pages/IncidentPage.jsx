import { useParams } from 'react-router';
import { useIncident, useIncidentMetrics, useIncidentTopology, useTimeline } from '../lib/queries.js';
import { useNow } from '../hooks/useNow.js';
import { HoverTimeProvider } from '../charts/HoverTime.jsx';
import { Panel } from '../components/Panel.jsx';
import { ErrorState, Loading, QueryState } from '../components/States.jsx';
import { IncidentHeader } from '../incident/IncidentHeader.jsx';
import { SignalsPanel } from '../incident/SignalsPanel.jsx';
import { BlastRadiusPanel } from '../incident/BlastRadiusPanel.jsx';
import { Timeline } from '../incident/Timeline.jsx';
import { AlertsTable } from '../incident/AlertsTable.jsx';
import { InvestigationPanel } from '../incident/InvestigationPanel.jsx';
import { RemediationPanel } from '../incident/RemediationPanel.jsx';
import { SimilarIncidentsPanel } from '../incident/SimilarIncidentsPanel.jsx';
import { RunbooksPanel } from '../incident/RunbooksPanel.jsx';
import styles from './IncidentPage.module.css';

export function IncidentPage() {
  const number = Number(useParams().number);
  const incident = useIncident(number);
  const live = incident.data ? incident.data.status !== 'resolved' : false;
  const timeline = useTimeline(number);
  const topology = useIncidentTopology(number, live);
  const metrics = useIncidentMetrics(number, live);
  const now = useNow(1000);

  if (incident.isPending) return <Loading label="Loading incident" />;
  if (incident.isError) return <ErrorState error={incident.error} onRetry={() => incident.refetch()} />;

  const changes = (timeline.data ?? []).filter((entry) => entry.kind === 'change');

  return (
    <HoverTimeProvider>
      <article className={styles.page}>
        <IncidentHeader incident={incident.data} now={now} />
        <InvestigationPanel number={number} />
        <RemediationPanel incident={incident.data} />

        <div className={styles.layout}>
          <div className={styles.main}>
            <SignalsPanel metrics={metrics} incident={incident.data} changes={changes} now={now} />
            <BlastRadiusPanel topology={topology} />
            <div className={styles.knowledge}>
              <SimilarIncidentsPanel number={number} />
              <RunbooksPanel number={number} />
            </div>
            <Panel title="Alerts" meta={`${incident.data.alerts.length} in this incident`} flush>
              <AlertsTable alerts={incident.data.alerts} now={now} />
            </Panel>
          </div>

          <Panel title="Timeline" meta="hover to line up with the charts" className={styles.side} flush>
            <QueryState query={timeline} loadingLabel="Building the timeline">
              {(entries) => <Timeline entries={entries} />}
            </QueryState>
          </Panel>
        </div>
      </article>
    </HoverTimeProvider>
  );
}
