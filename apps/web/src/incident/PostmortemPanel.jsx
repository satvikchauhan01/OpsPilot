import { useState } from 'react';
import { isResponder, useAuth } from '../auth/AuthContext.jsx';
import { useDraftPostmortem, useFinalizePostmortem, usePostmortem, useSavePostmortem } from '../lib/queries.js';
import { dateTime, incidentId } from '../lib/format.js';
import { Panel } from '../components/Panel.jsx';
import { Markdown } from '../components/Markdown.jsx';
import { Empty, QueryState } from '../components/States.jsx';
import { DownloadIcon } from '../components/Icons.jsx';
import { Button } from '../components/Button.jsx';
import styles from './PostmortemPanel.module.css';

const STATUS_LABEL = { drafting: 'Being written', draft: 'Draft', final: 'Final', failed: 'Not written' };

// The document's own headings sit below the panel's heading.
const HEADINGS = { h1: 'h3', h2: 'h4', h3: 'h5', h4: 'h5' };

// The server takes between 20 and 50,000 characters.
const MIN_LENGTH = 20;
const MAX_LENGTH = 50_000;

export function PostmortemPanel({ incident }) {
  const { user } = useAuth();
  const postmortem = usePostmortem(incident.number);
  const [editing, setEditing] = useState(false);
  const responder = isResponder(user);
  const current = postmortem.data;
  const filename = `${incidentId(incident.number)}-postmortem.md`;

  const actions = current?.markdown && current.status !== 'drafting' && !editing && (
    <>
      {responder && current.status === 'draft' && (
        <Button size="sm" onClick={() => setEditing(true)}>
          Edit
        </Button>
      )}
      <Button size="sm" onClick={() => download(filename, current.markdown)} title={`Download ${filename}`}>
        <DownloadIcon /> .md
      </Button>
    </>
  );

  return (
    <Panel title="Postmortem" meta={current && STATUS_LABEL[current.status]} actions={actions} id="postmortem">
      <QueryState query={postmortem} loadingLabel="Loading the postmortem">
        {(found) => {
          if (!found) return <NotWritten number={incident.number} responder={responder} />;
          if (found.status === 'drafting') return <Writing />;
          if (found.status === 'failed') {
            return <Failed number={incident.number} note={found.draftNote} responder={responder} />;
          }
          if (editing) {
            return <Editor number={incident.number} markdown={found.markdown} onDone={() => setEditing(false)} />;
          }
          return <PostmortemDocument number={incident.number} postmortem={found} responder={responder} />;
        }}
      </QueryState>
    </Panel>
  );
}

function download(filename, text) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/markdown;charset=utf-8' }));
  const link = Object.assign(document.createElement('a'), { href: url, download: filename });
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function NotWritten({ number, responder }) {
  const draft = useDraftPostmortem(number);
  return (
    <div className={styles.stack}>
      <Empty title="No postmortem yet">
        OpsPilot drafts one from the timeline, the investigation and the fix when an incident is resolved. This incident
        doesn't have one.
      </Empty>
      {responder && (
        <div className={styles.buttons}>
          <Button variant="primary" disabled={draft.isPending} onClick={() => draft.mutate()}>
            Write a draft
          </Button>
        </div>
      )}
      {draft.error && <p className={styles.error}>{draft.error.message}</p>}
    </div>
  );
}

function Writing() {
  return (
    <div className={styles.writing} role="status">
      <span className={styles.pulse} aria-hidden="true" />
      <div>
        <p className={styles.writingTitle}>Writing the postmortem</p>
        <p className={styles.muted}>
          The facts come straight from the incident's data; the AI writes the summary, the lessons and the action items
          around them. It takes a few seconds.
        </p>
      </div>
    </div>
  );
}

function Failed({ number, note, responder }) {
  const draft = useDraftPostmortem(number);
  return (
    <div className={styles.stack}>
      <p className={styles.error}>The postmortem could not be written: {note}</p>
      {responder && (
        <div className={styles.buttons}>
          <Button variant="primary" disabled={draft.isPending} onClick={() => draft.mutate()}>
            Try again
          </Button>
        </div>
      )}
    </div>
  );
}

function byline(postmortem) {
  const lines = [`Drafted by ${postmortem.draftedBy}, ${dateTime(postmortem.draftedAt)}`];
  if (postmortem.editedBy) lines.push(`edited by ${postmortem.editedBy}, ${dateTime(postmortem.editedAt)}`);
  if (postmortem.finalizedBy)
    lines.push(`made final by ${postmortem.finalizedBy}, ${dateTime(postmortem.finalizedAt)}`);
  return lines.join(' · ');
}

function PostmortemDocument({ number, postmortem, responder }) {
  const draft = useDraftPostmortem(number);
  const finalize = useFinalizePostmortem(number);
  const [step, setStep] = useState(null);
  const error = draft.error ?? finalize.error;

  return (
    <div className={styles.stack}>
      <p className={styles.byline}>{byline(postmortem)}</p>
      {postmortem.draftNote && <p className={styles.notice}>Written from a template: {postmortem.draftNote}.</p>}

      <Markdown components={HEADINGS} className={styles.document}>
        {postmortem.markdown}
      </Markdown>

      {postmortem.status === 'final' && (
        <p className={styles.final}>
          This postmortem is final. It is part of incident memory, where investigations of similar incidents find it.
        </p>
      )}

      {responder && postmortem.status === 'draft' && step === null && (
        <div className={styles.buttons}>
          <Button variant="primary" onClick={() => setStep('finalize')}>
            Mark as final
          </Button>
          <Button onClick={() => setStep('redraft')}>Write it again</Button>
        </div>
      )}

      {step === 'finalize' && (
        <div className={styles.confirm}>
          <p>
            A final postmortem can't be edited any more. It goes into incident memory, so future investigations of
            similar incidents can learn from it.
          </p>
          <div className={styles.buttons}>
            <Button
              variant="primary"
              disabled={finalize.isPending}
              onClick={() => finalize.mutate(undefined, { onSettled: () => setStep(null) })}
            >
              {finalize.isPending ? 'Saving…' : 'Make it final'}
            </Button>
            <Button onClick={() => setStep(null)}>Cancel</Button>
          </div>
        </div>
      )}

      {step === 'redraft' && (
        <div className={styles.confirm}>
          <p>
            OpsPilot writes the draft again from the incident's data.
            {postmortem.editedBy ? ' The edits made so far are replaced.' : ''}
          </p>
          <div className={styles.buttons}>
            <Button
              variant="primary"
              disabled={draft.isPending}
              onClick={() => draft.mutate(undefined, { onSettled: () => setStep(null) })}
            >
              Write it again
            </Button>
            <Button onClick={() => setStep(null)}>Cancel</Button>
          </div>
        </div>
      )}

      {error && <p className={styles.error}>{error.message}</p>}
    </div>
  );
}

function Editor({ number, markdown, onDone }) {
  const save = useSavePostmortem(number);
  const [text, setText] = useState(markdown);
  const [tab, setTab] = useState('write');
  const changed = text !== markdown;
  const length = text.trim().length;
  const valid = length >= MIN_LENGTH && length <= MAX_LENGTH;

  function submit(event) {
    event.preventDefault();
    if (!changed) return onDone();
    if (valid) save.mutate(text, { onSuccess: onDone });
  }

  return (
    <form className={styles.editor} onSubmit={submit}>
      <div className={styles.tabs} role="tablist" aria-label="Postmortem editor">
        {['write', 'preview'].map((name) => (
          <button
            key={name}
            type="button"
            role="tab"
            id={`postmortem-tab-${name}`}
            aria-selected={tab === name}
            aria-controls={`postmortem-${name}`}
            className={styles.tab}
            onClick={() => setTab(name)}
          >
            {name === 'write' ? 'Write' : 'Preview'}
          </button>
        ))}
        <span className={styles.count} data-over={!valid || undefined}>
          {length.toLocaleString()} / {MAX_LENGTH.toLocaleString()}
        </span>
      </div>

      {tab === 'write' ? (
        <textarea
          id="postmortem-write"
          role="tabpanel"
          aria-labelledby="postmortem-tab-write"
          className={styles.textarea}
          value={text}
          spellCheck
          rows={24}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            // Ctrl+S / Cmd+S saves, as in any editor
            if ((event.ctrlKey || event.metaKey) && event.key === 's') submit(event);
          }}
        />
      ) : (
        <div
          id="postmortem-preview"
          role="tabpanel"
          aria-labelledby="postmortem-tab-preview"
          className={styles.preview}
        >
          <Markdown components={HEADINGS} className={styles.document}>
            {text}
          </Markdown>
        </div>
      )}

      <div className={styles.buttons}>
        <Button type="submit" variant="primary" disabled={save.isPending || (changed && !valid)}>
          {save.isPending ? 'Saving…' : 'Save'}
        </Button>
        <Button onClick={onDone}>{changed ? 'Discard changes' : 'Cancel'}</Button>
        <span className={styles.hint}>Markdown. Ctrl+S saves.</span>
      </div>
      {save.error && <p className={styles.error}>{save.error.message}</p>}
    </form>
  );
}
