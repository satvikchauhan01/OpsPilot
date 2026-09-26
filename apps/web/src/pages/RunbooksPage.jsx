import { useEffect, useRef } from 'react';
import { Link, useLocation, useParams, useSearchParams } from 'react-router';
import { useRunbook, useRunbookSearch, useRunbooks } from '../lib/queries.js';
import { useDebouncedValue } from '../hooks/useDebouncedValue.js';
import { useHotkeys } from '../hooks/useHotkeys.js';
import { ACTION_LABEL } from '../lib/labels.js';
import { timeAgo } from '../lib/format.js';
import { Markdown } from '../components/Markdown.jsx';
import { Score } from '../components/Score.jsx';
import { Empty, ErrorState, Loading, QueryState } from '../components/States.jsx';
import { ServiceChip } from '../components/Tags.jsx';
import styles from './RunbooksPage.module.css';

export function RunbooksPage() {
  const { slug } = useParams();
  const anchor = decodeURIComponent(useLocation().hash.slice(1));
  const [params, setParams] = useSearchParams();
  const text = params.get('q') ?? '';
  const searchRef = useRef(null);
  const runbooks = useRunbooks();

  useHotkeys({ '/': () => searchRef.current?.focus() });

  // The search lives in the URL, so it stays while you open results and can be shared.
  function setText(value) {
    const next = new URLSearchParams(params);
    if (value) next.set('q', value);
    else next.delete('q');
    setParams(next, { replace: true });
  }

  return (
    <div className={styles.page} data-reading={slug ? '' : undefined}>
      <aside className={styles.index} aria-label="Runbook index">
        <header className={styles.indexHeader}>
          <h1>Runbooks</h1>
          <div className={styles.search} role="search">
            <label htmlFor="runbook-search" className="visually-hidden">
              Search runbooks
            </label>
            <input
              id="runbook-search"
              ref={searchRef}
              type="search"
              value={text}
              placeholder="Describe what you see"
              autoComplete="off"
              spellCheck={false}
              onChange={(event) => setText(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Escape') {
                  setText('');
                  event.currentTarget.blur();
                }
              }}
            />
            <kbd aria-hidden="true">/</kbd>
          </div>
        </header>
        <div className={styles.listArea}>
          {text.trim().length >= 2 ? (
            <SearchResults text={text} />
          ) : (
            <RunbookList query={runbooks} active={slug} anchor={anchor} />
          )}
        </div>
      </aside>

      <div className={styles.reader}>
        {slug ? <RunbookDocument slug={slug} anchor={anchor} /> : <Guide query={runbooks} />}
      </div>
    </div>
  );
}

function RunbookList({ query, active, anchor }) {
  return (
    <QueryState query={query} loadingLabel="Loading runbooks">
      {(runbooks) =>
        runbooks.length === 0 ? (
          <Empty title="No runbooks yet">Add Markdown files to the runbooks folder and restart the server.</Empty>
        ) : (
          <ol className={styles.list}>
            {runbooks.map((runbook) => {
              const isActive = runbook.slug === active;
              return (
                <li key={runbook.slug} className={styles.item} data-active={isActive || undefined}>
                  <Link
                    to={`/runbooks/${runbook.slug}`}
                    className={styles.itemLink}
                    aria-current={isActive ? 'page' : undefined}
                  >
                    <span className={styles.itemTitle}>{runbook.title}</span>
                    <span className={styles.itemSummary}>{runbook.summary}</span>
                  </Link>
                  {isActive && (
                    <ol className={styles.toc} aria-label={`Sections of ${runbook.title}`}>
                      {runbook.sections.map((section) => (
                        <li key={section.anchor}>
                          <Link
                            to={`#${section.anchor}`}
                            aria-current={section.anchor === anchor ? 'location' : undefined}
                          >
                            {section.heading}
                          </Link>
                        </li>
                      ))}
                    </ol>
                  )}
                </li>
              );
            })}
          </ol>
        )
      }
    </QueryState>
  );
}

function SearchResults({ text }) {
  const settled = useDebouncedValue(text.trim(), 250);
  const search = useRunbookSearch(settled);
  const location = useLocation();

  if (settled.length < 2 || search.isPending) return <Loading label="Searching" />;
  if (search.isError) return <ErrorState error={search.error} onRetry={() => search.refetch()} />;
  if (search.data.length === 0) return <Empty title="No matching sections">Try describing the symptom instead.</Empty>;

  return (
    <ol className={styles.results} aria-label={`Sections closest to "${settled}"`} aria-busy={search.isFetching}>
      {search.data.map((hit) => (
        <li key={`${hit.slug}#${hit.anchor}`} className={styles.result}>
          <Link
            to={{ pathname: `/runbooks/${hit.slug}`, search: location.search, hash: hit.anchor }}
            className={styles.resultLink}
          >
            <span className={styles.resultRunbook}>{hit.title}</span>
            <span className={styles.resultHeading}>{hit.heading}</span>
            <span className={styles.resultText}>{hit.text}</span>
          </Link>
          <Score value={hit.similarity} label={`Similarity of "${hit.heading}"`} />
        </li>
      ))}
    </ol>
  );
}

function RunbookDocument({ slug, anchor }) {
  const runbook = useRunbook(slug);
  const loaded = Boolean(runbook.data);

  // A section link scrolls to its section once the runbook is there. Opening another
  // runbook starts at its top.
  useEffect(() => {
    if (!loaded) return;
    const target = anchor && document.getElementById(anchor);
    if (target) target.scrollIntoView({ block: 'start' });
    else window.scrollTo({ top: 0 });
  }, [loaded, slug, anchor]);

  return (
    <QueryState query={runbook} loadingLabel="Opening the runbook">
      {(doc) => (
        <article className={styles.doc} aria-labelledby="runbook-title">
          <Link to="/runbooks" className={styles.back}>
            ← All runbooks
          </Link>
          <header className={styles.docHeader}>
            <p className="caption">{doc.owner ?? 'Runbook'}</p>
            <h2 id="runbook-title">{doc.title}</h2>
            <dl className={styles.meta}>
              <div>
                <dt>Alerts</dt>
                <dd>
                  {doc.alerts.map((alert) => (
                    <span key={alert} className={styles.alert}>
                      {alert}
                    </span>
                  ))}
                </dd>
              </div>
              <div>
                <dt>Services</dt>
                <dd>
                  {doc.services.map((service) => (
                    <ServiceChip key={service} service={service} />
                  ))}
                </dd>
              </div>
              <div>
                <dt>Recommends</dt>
                <dd>
                  {doc.actions.length > 0
                    ? doc.actions.map((action) => ACTION_LABEL[action]).join(', ')
                    : 'no fix of its own, it is for diagnosis'}
                </dd>
              </div>
              <div>
                <dt>Indexed</dt>
                <dd>{timeAgo(doc.indexedAt)}</dd>
              </div>
            </dl>
          </header>

          <section id="overview" className={styles.section} data-active={anchor === 'overview' || undefined}>
            <Markdown>{doc.intro}</Markdown>
          </section>
          {doc.sections.map((section) => (
            <section
              key={section.anchor}
              id={section.anchor}
              className={styles.section}
              data-active={section.anchor === anchor || undefined}
              aria-labelledby={`${section.anchor}-heading`}
            >
              <h3 id={`${section.anchor}-heading`}>
                <Link to={`#${section.anchor}`} className={styles.headingLink}>
                  {section.heading}
                </Link>
              </h3>
              <Markdown>{section.markdown}</Markdown>
            </section>
          ))}
        </article>
      )}
    </QueryState>
  );
}

function Guide({ query }) {
  const runbooks = query.data ?? [];
  const sections = runbooks.reduce((total, runbook) => total + runbook.sections.length, 0);
  return (
    <div className={styles.guide}>
      <p className="caption">Searching by meaning</p>
      <p>
        Describe what you are seeing in your own words. Every runbook section is compared with your description by
        meaning rather than by keywords, so "pods keep dying" finds the crash-loop runbook even though it never uses
        those words.
      </p>
      <p>
        Incidents do this on their own: each incident page lists the sections closest to its alerts, recent changes and
        root cause, and the AI investigator reads them as evidence.
      </p>
      {runbooks.length > 0 && (
        <p className={styles.muted}>
          {runbooks.length} runbooks, {sections} sections.
        </p>
      )}
    </div>
  );
}
