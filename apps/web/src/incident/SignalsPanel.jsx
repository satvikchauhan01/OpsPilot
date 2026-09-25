import { Panel } from '../components/Panel.jsx';
import { QueryState } from '../components/States.jsx';
import { TimeSeriesChart } from '../charts/TimeSeriesChart.jsx';
import { latency, percent, rate } from '../lib/format.js';
import styles from './SignalsPanel.module.css';

// Thresholds match the alert rules, so a line crossing one shows when an alert started firing.
const CHARTS = [
  {
    metric: 'errorRatio',
    title: 'Error rate',
    format: (v) => percent(v),
    threshold: { value: 0.05, label: 'alerts at 5%' },
  },
  { metric: 'p95', title: 'Latency, p95', format: latency, threshold: { value: 1, label: 'alerts at 1 s' } },
  { metric: 'rps', title: 'Requests per second', format: rate },
  {
    metric: 'memory',
    title: 'Memory used of limit',
    format: (v) => percent(v, 0),
    threshold: { value: 0.8, label: 'alerts at 80%' },
  },
];

const SATURATION_CHART = {
  metric: 'saturation',
  title: 'Payment processor connections in use',
  format: (v) => percent(v, 0),
  threshold: { value: 0.9, label: 'alerts at 90%' },
};

export function SignalsPanel({ metrics, incident, changes, now }) {
  const shade = {
    from: new Date(incident.startedAt).getTime(),
    to: incident.resolvedAt ? new Date(incident.resolvedAt).getTime() : now,
  };
  const emphasis = incident.services;
  const markers = changes.map((entry) => ({ at: new Date(entry.at).getTime(), label: entry.title }));

  return (
    <Panel title="Signals" meta="shaded: incident · ▾ changes">
      <QueryState query={metrics} loadingLabel="Querying Prometheus">
        {(data) => {
          const domain = [new Date(data.window.start).getTime(), new Date(data.window.end).getTime()];
          const saturationPeak = Math.max(
            0,
            ...data.metrics.saturation.flatMap(({ points }) => points.map(([, v]) => v ?? 0)),
          );
          const charts = saturationPeak > 0.5 ? [...CHARTS, SATURATION_CHART] : CHARTS;

          return (
            <div className={styles.grid} style={{ opacity: metrics.isPlaceholderData ? 0.6 : 1 }}>
              {charts.map((chart) => (
                <TimeSeriesChart
                  key={chart.metric}
                  title={chart.title}
                  series={data.metrics[chart.metric]}
                  domain={domain}
                  format={chart.format}
                  threshold={chart.threshold}
                  markers={markers}
                  shade={shade}
                  emphasis={emphasis}
                  height={170}
                />
              ))}
            </div>
          );
        }}
      </QueryState>
    </Panel>
  );
}
