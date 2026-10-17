import { useEffect, useEffectEvent, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router';
import {
  useActions,
  useIncident,
  useIncidentMetrics,
  useIncidentTopology,
  useInvestigation,
  usePostmortem,
  useTimeline,
} from '../lib/queries.js';
import { clock, incidentId, latency, percent } from '../lib/format.js';
import { useHotkeys } from '../hooks/useHotkeys.js';
import { useNow } from '../hooks/useNow.js';
import { useReducedMotion } from '../hooks/useMediaQuery.js';
import { ButtonLink } from '../components/Button.jsx';
import { PageHeader } from '../components/PageHeader.jsx';
import { Panel } from '../components/Panel.jsx';
import { Empty, ErrorState, Loading } from '../components/States.jsx';
import { ServiceChip, ToneMark } from '../components/Tags.jsx';
import { ArrowLeftIcon } from '../components/Icons.jsx';
import { TimeSeriesChart } from '../charts/TimeSeriesChart.jsx';
import { TopologyMap } from '../topology/TopologyMap.jsx';
import { Journey } from '../incident/Journey.jsx';
import { journeyOf } from '../incident/journey.js';
import { Scrubber } from '../replay/Scrubber.jsx';
import { eventsIn, mapAt, narrativeAt, replayWindow, snapshotAt } from '../replay/model.js';
import styles from './ReplayPage.module.css';

const TICK_MS = 100;
const TARGET_SECONDS = 30;
const SPEED_STEPS = [10, 30, 60, 120];

const CHARTS = [
  { metric: 'errorRatio', title: 'Error rate', format: (v) => percent(v), threshold: { value: 0.05, label: '5%' } },
  { metric: 'p95', title: 'Latency, p95', format: latency, threshold: { value: 1, label: '1 s' } },
];

export function ReplayPage() {
  const number = Number(useParams().number);
  const incident = useIncident(number);
  const timeline = useTimeline(number);

  if (incident.isPending || timeline.isPending) return <Loading label="Loading the incident's history" />;
  if (incident.isError) return <ErrorState error={incident.error} onRetry={() => incident.refetch()} />;
  if (timeline.isError) return <ErrorState error={timeline.error} onRetry={() => timeline.refetch()} />;
  return <Replay incident={incident.data} entries={timeline.data} />;
}

function Replay({ incident, entries }) {
  const number = incident.number;
  const investigation = useInvestigation(number);
  const actions = useActions(number);
  const postmortem = usePostmortem(number);
  const metrics = useIncidentMetrics(number, false);
  const topology = useIncidentTopology(number, false);
  const now = useNow(5000);
  const still = useReducedMotion();

  const range = useMemo(() => replayWindow(incident, entries, now), [incident, entries, now]);
  const events = useMemo(() => eventsIn(entries, range), [entries, range]);
  const [speed, setSpeed] = useState(() => closestSpeed((range.end - range.start) / 1000 / TARGET_SECONDS));
  const [playing, setPlaying] = useState(false);
  const [position, setPosition] = useState(null);
  const latest = useRef(null);
  const time = Math.min(range.end, Math.max(range.start, position ?? range.start));

  function seek(value) {
    latest.current = value;
    setPosition(value);
  }

  const tick = useEffectEvent((elapsed) => {
    const next = Math.min(range.end, (latest.current ?? time) + elapsed * speed);
    seek(next);
    if (next >= range.end) setPlaying(false);
  });

  useEffect(() => {
    if (!playing) return;
    let last = performance.now();
    const timer = setInterval(() => {
      const current = performance.now();
      tick(current - last);
      last = current;
    }, TICK_MS);
    return () => clearInterval(timer);
  }, [playing]);

  function togglePlay() {
    if (!playing && time >= range.end) seek(range.start);
    setPlaying(!playing);
  }

  function step(direction) {
    const times = events.map((event) => new Date(event.at).getTime());
    const target = direction > 0 ? times.find((at) => at > time + 500) : times.filter((at) => at < time - 500).at(-1);
    seek(target ?? (direction > 0 ? range.end : range.start));
  }

  useHotkeys({
    ' ': togglePlay,
    ArrowRight: () => step(1),
    ArrowLeft: () => step(-1),
    Home: () => seek(range.start),
    End: () => seek(range.end),
  });

  const data = { incident, investigation: investigation.data, actions: actions.data, postmortem: postmortem.data };
  const snapshot = snapshotAt(time, data);
  const past = events.filter((event) => new Date(event.at).getTime() <= time);
  const map = topology.data
    ? mapAt(time, { topology: topology.data, metrics: metrics.data?.metrics, alerts: incident.alerts })
    : null;
  const opened = time >= new Date(incident.history?.[0]?.at ?? incident.startedAt).getTime();
  const story = narrativeAt(time, snapshot, { firing: map?.firing ?? [], opened, past });
  const incidentSpan = {
    from: new Date(incident.startedAt).getTime(),
    to: incident.resolvedAt ? new Date(incident.resolvedAt).getTime() : range.end,
  };
  // Before the first alert nothing has happened yet, not even the detection
  const steps = journeyOf(snapshot).map((entry) =>
    time < incidentSpan.from ? { key: entry.key, label: entry.label } : entry,
  );

  return (
    <div className={styles.page}>
      <PageHeader
        kicker={`Replay · ${incidentId(number)}`}
        title={incident.title}
        lede="Every alert, AI step and fix, played back on the clock it happened on. The map and charts show each moment as it was recorded."
        actions={
          <ButtonLink to={`/incidents/${number}`} size="sm">
            <ArrowLeftIcon size={14} /> Back to the incident
          </ButtonLink>
        }
      />

      <Scrubber
        range={range}
        time={time}
        playing={playing}
        speed={speed}
        events={events}
        incidentSpan={incidentSpan}
        onPlay={togglePlay}
        onSeek={seek}
        onSpeed={setSpeed}
        onStep={step}
      />

      <div className={styles.stage}>
        <div className={styles.main}>
          <section className={styles.story} data-tone={story.tone} aria-live="polite">
            <p className={styles.phase}>
              <ToneMark tone={story.tone} />
              {story.phase}
            </p>
            <p className={styles.storyText}>{story.text}</p>
          </section>

          <Panel title="Service map" meta={`at ${clock(time)}`}>
            {!map ? (
              <Loading label="Reading the service graph" />
            ) : map.nodes.length === 0 ? (
              <Empty title="No traffic was recorded around this incident" />
            ) : (
              <>
                <TopologyMap
                  nodes={map.nodes}
                  edges={map.edges}
                  health={map.health}
                  suspected={opened ? topology.data.suspected : undefined}
                  blastRadius={opened ? topology.data.blastRadius : []}
                  animated={playing && !still}
                />
                <p className={styles.firing}>
                  {map.firing.length === 0 ? (
                    <span className={styles.muted}>No alert firing.</span>
                  ) : (
                    map.firing.map((alert) => (
                      <span key={alert.id} className={styles.alert} data-severity={alert.severity}>
                        {alert.name} <ServiceChip service={alert.service} />
                      </span>
                    ))
                  )}
                </p>
              </>
            )}
          </Panel>

          <Panel title="Signals" meta="veiled: not happened yet">
            {metrics.isPending ? (
              <Loading label="Querying Prometheus" />
            ) : metrics.isError || !metrics.data ? (
              <Empty title="The metrics for this window are no longer available">
                The replay still has every event; Prometheus keeps a limited history.
              </Empty>
            ) : (
              <div className={styles.charts}>
                {CHARTS.map((chart) => (
                  <TimeSeriesChart
                    key={chart.metric}
                    title={chart.title}
                    series={metrics.data.metrics[chart.metric]}
                    domain={[range.start, range.end]}
                    format={chart.format}
                    threshold={chart.threshold}
                    emphasis={incident.services}
                    playhead={time}
                    height={150}
                  />
                ))}
              </div>
            )}
          </Panel>
        </div>

        <aside className={styles.side}>
          <Panel title="Progress">
            <Journey steps={steps} startedAt={incident.startedAt} vertical />
          </Panel>
          <Panel title="Events" meta={`${past.length} of ${events.length}`} flush>
            <EventList events={events} time={time} onSeek={seek} />
          </Panel>
        </aside>
      </div>
    </div>
  );
}

function EventList({ events, time, onSeek }) {
  const listRef = useRef(null);
  const currentIndex = events.findLastIndex((event) => new Date(event.at).getTime() <= time);

  useEffect(() => {
    listRef.current?.querySelector('[data-current]')?.scrollIntoView({ block: 'nearest' });
  }, [currentIndex]);

  return (
    <ol className={styles.events} ref={listRef}>
      {events.map((event, index) => (
        <li key={event.id}>
          <button
            type="button"
            className={styles.event}
            data-state={index < currentIndex ? 'past' : index === currentIndex ? 'current' : 'future'}
            data-current={index === currentIndex || undefined}
            onClick={() => onSeek(new Date(event.at).getTime())}
          >
            <time className={styles.eventTime}>{clock(event.at)}</time>
            <ToneMark tone={event.tone} />
            <span className={styles.eventTitle}>{event.title}</span>
          </button>
        </li>
      ))}
    </ol>
  );
}

// The preset speed that brings the whole replay closest to half a minute.
function closestSpeed(wanted) {
  return SPEED_STEPS.reduce((best, step) => (Math.abs(step - wanted) < Math.abs(best - wanted) ? step : best));
}
