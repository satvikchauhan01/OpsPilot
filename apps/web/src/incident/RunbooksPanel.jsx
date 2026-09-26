import { Link } from 'react-router';
import { useIncidentRunbooks } from '../lib/queries.js';
import { Panel } from '../components/Panel.jsx';
import { Score } from '../components/Score.jsx';
import { Empty, QueryState } from '../components/States.jsx';
import styles from './RunbooksPanel.module.css';

export function RunbooksPanel({ number }) {
  const sections = useIncidentRunbooks(number);

  return (
    <Panel title="Runbooks" meta="closest sections to this incident">
      <QueryState query={sections} loadingLabel="Searching the runbooks">
        {(hits) =>
          hits.length === 0 ? (
            <Empty title="No runbook sections yet">Runbooks are matched on the incident's alerts and changes.</Empty>
          ) : (
            <ol className={styles.runbooks}>
              {groupByRunbook(hits).map((runbook) => (
                <li key={runbook.slug} className={styles.runbook}>
                  <Link to={`/runbooks/${runbook.slug}`} className={styles.runbookTitle}>
                    {runbook.title}
                  </Link>
                  <ul className={styles.sections}>
                    {runbook.sections.map((section) => (
                      <li key={section.anchor} className={styles.section}>
                        <Link to={`/runbooks/${runbook.slug}#${section.anchor}`} className={styles.sectionLink}>
                          <span className={styles.heading}>{section.heading}</span>
                          <span className={styles.snippet}>{section.text}</span>
                        </Link>
                        <Score value={section.similarity} label={`Similarity of "${section.heading}"`} />
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ol>
          )
        }
      </QueryState>
    </Panel>
  );
}

// Sections arrive best first. Grouping keeps that order: runbooks by their best section, and
// sections by score within each runbook.
function groupByRunbook(hits) {
  const runbooks = new Map();
  for (const hit of hits) {
    if (!runbooks.has(hit.slug)) runbooks.set(hit.slug, { slug: hit.slug, title: hit.title, sections: [] });
    runbooks.get(hit.slug).sections.push(hit);
  }
  return [...runbooks.values()];
}
