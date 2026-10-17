import { Link } from 'react-router';
import { useStoredState } from '../hooks/useStoredState.js';
import { useInsights } from '../lib/queries.js';
import { serviceColor } from '../lib/colors.js';
import { ACTION_LABEL, CAUSE_LABEL } from '../lib/labels.js';
import { duration, incidentId, percent, plural } from '../lib/format.js';
import { PageHeader } from '../components/PageHeader.jsx';
import { Panel } from '../components/Panel.jsx';
import { Segmented } from '../components/Segmented.jsx';
import { Stat, Stats } from '../components/Stat.jsx';
import { Empty, QueryState } from '../components/States.jsx';
import { ServiceChip, ToneMark } from '../components/Tags.jsx';
import { BarList } from '../insights/BarList.jsx';
import { ColumnChart } from '../insights/ColumnChart.jsx';
import { DurationPlot } from '../insights/DurationPlot.jsx';
import styles from './InsightsPage.module.css';

const RANGES = [
  { value: 7, label: '7 days' },
  { value: 30, label: '30 days' },
  { value: 90, label: '90 days' },
  { value: 365, label: 'A year' },
];

const dayFormat = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', timeZone: 'UTC' });
const dayLabel = (day) => dayFormat.format(new Date(`${day}T00:00:00Z`));

export function InsightsPage() {
  const [days, setDays] = useStoredState('opspilot-insights-days', 30);
  const insights = useInsights(days);

  return (
    <div className={styles.page}>
      <PageHeader
        kicker="Operate"
        title="Insights"
        lede="How incidents went: how fast OpsPilot found the cause and the fix, how often the fixes worked, and where the trouble starts."
        actions={<Segmented label="Time range" options={RANGES} value={days} onChange={setDays} />}
      />

      <QueryState query={insights} loadingLabel="Adding up the incidents">
        {(data) => (
          <div className={styles.content} style={{ opacity: insights.isPlaceholderData ? 0.6 : 1 }}>
            <Summary data={data} />
            {data.totals.incidents === 0 ? (
              <Panel title="Nothing to show">
                <Empty title={`No incidents in the last ${days} days`}>
                  Pick a longer range, or break the shop from the demo page to make one.
                </Empty>
              </Panel>
            ) : (
              <Details data={data} />
            )}
          </div>
        )}
      </QueryState>
    </div>
  );
}

function Summary({ data }) {
  const { totals, timing, fixes, ai } = data;
  const time = ({ median }) => (median === null ? '—' : duration(median));
  return (
    <div data-tour="insights-kpis">
      <Stats label="Summary">
        <Stat
          label="Incidents"
          value={totals.incidents}
          detail={`${totals.critical} critical · ${totals.open} still open`}
        />
        <Stat
          label="Time to root cause"
          value={time(timing.toRootCause)}
          detail={`median, ${timing.toRootCause.count} investigated`}
        />
        <Stat label="Time to verified fix" value={time(timing.toFix)} detail={`median, ${timing.toFix.count} fixed`} />
        <Stat
          label="Time to resolve"
          value={time(timing.toResolve)}
          detail={`median, ${timing.toResolve.count} resolved`}
        />
        <Stat
          label="Fixes that worked"
          value={fixes.successRate === null ? '—' : percent(fixes.successRate, 0)}
          tone={fixes.successRate !== null && fixes.successRate < 0.7 ? 'warning' : undefined}
          detail={`${fixes.verified} verified, ${fixes.failed} failed`}
        />
        <Stat
          label="AI fixes approved"
          value={ai.fixes.proposed ? percent(ai.fixes.approved / ai.fixes.proposed, 0) : '—'}
          detail={`${ai.fixes.approved} of ${ai.fixes.proposed} proposed`}
        />
      </Stats>
    </div>
  );
}

function Details({ data }) {
  const slowest = [...data.incidents]
    .filter((incident) => incident.toResolve !== null)
    .sort((a, b) => b.toResolve - a.toResolve)
    .slice(0, 5);

  return (
    <>
      <div className={styles.row}>
        <Panel title="Over time">
          <ColumnChart
            title="Incidents per day"
            rows={data.perDay.map((day) => ({
              key: day.day,
              label: dayLabel(day.day),
              values: { critical: day.critical, warning: day.warning },
            }))}
            series={[
              { key: 'critical', label: 'critical', tone: 'critical', mark: <ToneMark tone="critical" /> },
              { key: 'warning', label: 'warning', tone: 'warning', mark: <ToneMark tone="warning" /> },
            ]}
          />
        </Panel>
        <Panel title="Duration">
          <DurationPlot incidents={data.incidents} window={data.window} />
        </Panel>
      </div>

      <div className={styles.row3}>
        <Panel title="Where incidents start" meta="likely origin">
          <BarList
            rows={data.byService.map((row) => ({
              name: row.name,
              label: row.name === 'unknown' ? 'unknown' : <ServiceChip service={row.name} />,
              value: row.incidents,
              color: row.name === 'unknown' ? undefined : serviceColor(row.name),
              detail: row.medianToResolve ? `${duration(row.medianToResolve)} median` : undefined,
            }))}
          />
        </Panel>
        <Panel title="Root causes" meta="from the latest investigation">
          <BarList
            rows={data.byCause.map((row) => ({
              name: row.name,
              label: CAUSE_LABEL[row.name] ?? 'Not investigated',
              value: row.incidents,
            }))}
          />
        </Panel>
        <Panel title="Fix outcomes" meta="per kind of fix">
          <BarList
            rows={Object.entries(data.fixes.byType).map(([type, counts]) => ({
              name: type,
              label: ACTION_LABEL[type],
              value: counts.verified + counts.failed + counts.rejected,
              segments: [
                { value: counts.verified, tone: 'ok', label: 'verified' },
                { value: counts.failed, tone: 'critical', label: 'failed' },
                { value: counts.rejected, tone: 'neutral', label: 'rejected' },
              ],
              detail: `${counts.verified} worked`,
            }))}
          />
          <ul className={styles.key}>
            <li>
              <span className={styles.swatch} data-tone="ok" /> verified
            </li>
            <li>
              <span className={styles.swatch} data-tone="critical" /> failed
            </li>
            <li>
              <span className={styles.swatch} data-tone="neutral" /> rejected by a person
            </li>
          </ul>
        </Panel>
      </div>

      <div className={styles.row}>
        <Panel title="The AI investigator">
          <dl className={styles.facts}>
            <Fact label="Investigations" value={data.ai.investigations} detail={`${data.ai.failed} failed`} />
            <Fact
              label="Median length"
              value={data.ai.medianDuration === null ? '—' : duration(data.ai.medianDuration)}
            />
            <Fact label="Median model calls" value={data.ai.medianModelCalls ?? '—'} />
            <Fact
              label="Median confidence"
              value={data.ai.medianConfidence === null ? '—' : percent(data.ai.medianConfidence, 0)}
              detail="in its first answer"
            />
          </dl>
          {data.usage.length > 0 && (
            <ColumnChart
              title="Model calls per day"
              rows={data.usage.map((day) => ({
                key: day.day,
                label: dayLabel(day.day),
                values: { requests: day.requests },
              }))}
              series={[{ key: 'requests', label: 'model calls', tone: 'neutral', mark: null }]}
            />
          )}
        </Panel>
        <Panel title="Took the longest" flush>
          <ol className={styles.slowest}>
            {slowest.map((incident) => (
              <li key={incident.number}>
                <Link to={`/incidents/${incident.number}`} className={styles.slowLink}>
                  <span className={styles.slowId}>{incidentId(incident.number)}</span>
                  <span className={styles.slowTitle}>{incident.title}</span>
                  <span className={styles.slowTime}>{duration(incident.toResolve)}</span>
                </Link>
              </li>
            ))}
          </ol>
          <p className={styles.note}>
            Postmortems: {data.postmortems.final} final, {plural(data.postmortems.draft, 'draft')}.
          </p>
        </Panel>
      </div>
    </>
  );
}

function Fact({ label, value, detail }) {
  return (
    <div className={styles.fact}>
      <dt className="caption">{label}</dt>
      <dd className={styles.factValue}>{value}</dd>
      {detail && <dd className={styles.factDetail}>{detail}</dd>}
    </div>
  );
}
