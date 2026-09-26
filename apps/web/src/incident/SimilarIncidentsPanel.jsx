import { Link } from 'react-router';
import { useSimilarIncidents } from '../lib/queries.js';
import { dateTime, duration, incidentId } from '../lib/format.js';
import { CAUSE_LABEL } from '../lib/labels.js';
import { Panel } from '../components/Panel.jsx';
import { Score } from '../components/Score.jsx';
import { Empty, QueryState } from '../components/States.jsx';
import { ServiceChip } from '../components/Tags.jsx';
import styles from './SimilarIncidentsPanel.module.css';

export function SimilarIncidentsPanel({ number }) {
  const similar = useSimilarIncidents(number);

  return (
    <Panel title="Similar incidents" meta="from incident memory">
      <QueryState query={similar} loadingLabel="Searching incident memory">
        {(incidents) =>
          incidents.length === 0 ? (
            <Empty title="Nothing like this before">
              OpsPilot remembers every resolved incident, and will point back to this one if it happens again.
            </Empty>
          ) : (
            <ol className={styles.list}>
              {incidents.map((past) => (
                <li key={past.number} className={styles.incident}>
                  <div className={styles.head}>
                    <Link to={`/incidents/${past.number}`} className={styles.title}>
                      <span className="mono">{incidentId(past.number)}</span> {past.title}
                    </Link>
                    <Score value={past.similarity} label={`Similarity of ${incidentId(past.number)}`} />
                  </div>
                  <dl className={styles.facts}>
                    <div>
                      <dt>Cause</dt>
                      <dd>
                        {past.rootCause ? (
                          <>
                            <ServiceChip service={past.rootCause.service} />{' '}
                            <span className={styles.cause}>{CAUSE_LABEL[past.rootCause.causeType]}</span>{' '}
                            {past.rootCause.title}
                          </>
                        ) : (
                          <span className={styles.muted}>never investigated</span>
                        )}
                      </dd>
                    </div>
                    <div>
                      <dt>Fixed by</dt>
                      <dd>{past.fix?.summary ?? <span className={styles.muted}>not recorded</span>}</dd>
                    </div>
                    <div>
                      <dt>When</dt>
                      <dd className={styles.muted}>
                        {dateTime(past.startedAt)}, lasted{' '}
                        {duration(new Date(past.resolvedAt) - new Date(past.startedAt))}
                      </dd>
                    </div>
                  </dl>
                </li>
              ))}
            </ol>
          )
        }
      </QueryState>
    </Panel>
  );
}
