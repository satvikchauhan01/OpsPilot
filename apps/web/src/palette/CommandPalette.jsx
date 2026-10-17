import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { canRespond, useAuth } from '../auth/AuthContext.jsx';
import { useDemo, useIncidents, useRunbooks, useServices, useStartScenario } from '../lib/queries.js';
import { incidentId } from '../lib/format.js';
import { Dialog } from '../components/Dialog.jsx';
import { Kbd } from '../components/Kbd.jsx';
import { ToneMark } from '../components/Tags.jsx';
import { BoltIcon, BookIcon, IncidentIcon, SearchIcon, ServiceIcon } from '../components/Icons.jsx';
import { sectionsFor } from '../layout/navigation.js';
import { useServiceLink } from '../services/serviceLink.js';
import { fuzzyMatch } from './fuzzy.js';
import styles from './CommandPalette.module.css';

const PER_GROUP = 7;
const STATUS_LABEL = { open: 'open', investigating: 'investigating', mitigating: 'mitigating', resolved: 'resolved' };
const HEALTH_TONE = { ok: 'ok', warning: 'warning', critical: 'critical' };

/**
 * Ctrl+K: one box to reach anything. Pages, incidents, services, runbooks, demo scenarios
 * and the console's own commands, matched loosely and ranked as you type. `commands` are the
 * shell's own actions (theme, notifications, tour...).
 */
export function CommandPalette({ commands, onClose }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const serviceLink = useServiceLink();
  const listId = useId();
  const listRef = useRef(null);
  const [text, setText] = useState('');
  const [active, setActive] = useState(0);

  const incidents = useIncidents({ limit: 100 });
  const services = useServices();
  const runbooks = useRunbooks();
  const demo = useDemo();
  const startScenario = useStartScenario();

  const items = useMemo(() => {
    const go = (to) => () => navigate(to);
    const all = [];

    for (const section of sectionsFor(user)) {
      for (const page of section.items) {
        all.push({
          id: `page:${page.to}`,
          group: 'Pages',
          label: page.label,
          keys: page.keys,
          icon: page.icon,
          run: go(page.to),
        });
      }
    }
    for (const incident of incidents.data ?? []) {
      all.push({
        id: `incident:${incident.number}`,
        group: 'Incidents',
        label: `${incidentId(incident.number)} ${incident.title}`,
        hint: STATUS_LABEL[incident.status],
        tone: incident.status === 'resolved' ? 'ok' : incident.severity,
        icon: IncidentIcon,
        recent: incident.status !== 'resolved',
        run: go(`/incidents/${incident.number}`),
      });
    }
    for (const service of services.data?.services ?? []) {
      all.push({
        id: `service:${service.name}`,
        group: 'Services',
        label: service.name,
        hint: service.workload?.version ? `v${service.workload.version}` : undefined,
        tone: HEALTH_TONE[service.status],
        icon: ServiceIcon,
        run: () => navigate(serviceLink(service.name)),
      });
    }
    for (const runbook of runbooks.data ?? []) {
      all.push({
        id: `runbook:${runbook.slug}`,
        group: 'Runbooks',
        label: runbook.title,
        icon: BookIcon,
        run: go(`/runbooks/${runbook.slug}`),
      });
    }
    if (canRespond(user) && demo.data?.enabled && !demo.data.active) {
      for (const scenario of demo.data.scenarios) {
        all.push({
          id: `scenario:${scenario.key}`,
          group: 'Demo',
          label: `Start ${scenario.id}: ${scenario.title}`,
          hint: 'breaks the shop',
          icon: BoltIcon,
          run: () => {
            startScenario.mutate(scenario.key);
            navigate('/demo');
          },
        });
      }
    }
    return [...all, ...commands.map((command) => ({ ...command, group: 'Actions' }))];
  }, [user, incidents.data, services.data, runbooks.data, demo.data, commands, navigate, serviceLink, startScenario]);

  const results = useMemo(() => rank(items, text, navigate), [items, text, navigate]);
  const flat = results.flatMap((group) => group.items);
  const current = Math.min(active, flat.length - 1);

  useEffect(() => {
    listRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [current, text]);

  function choose(item) {
    onClose();
    item.run();
  }

  function onKeyDown(event) {
    const moves = {
      ArrowDown: (current + 1) % Math.max(1, flat.length),
      ArrowUp: (current - 1 + flat.length) % Math.max(1, flat.length),
      Home: 0,
      End: flat.length - 1,
    };
    if (event.key in moves) {
      event.preventDefault();
      setActive(moves[event.key]);
    } else if (event.key === 'Enter' && flat[current]) {
      event.preventDefault();
      choose(flat[current]);
    }
  }

  return (
    <Dialog onClose={onClose} label="Jump to" placement="top" className={styles.dialog}>
      <div className={styles.search}>
        <SearchIcon size={18} />
        <input
          autoFocus
          role="combobox"
          aria-expanded="true"
          aria-controls={listId}
          aria-activedescendant={flat[current] ? optionId(listId, flat[current]) : undefined}
          aria-label="Search pages, incidents, services, runbooks and actions"
          placeholder="Search incidents, services, runbooks or type a command"
          value={text}
          spellCheck={false}
          autoComplete="off"
          onChange={(event) => {
            setText(event.target.value);
            setActive(0);
          }}
          onKeyDown={onKeyDown}
        />
        <Kbd>Esc</Kbd>
      </div>

      <div className={styles.results} ref={listRef}>
        {flat.length === 0 ? (
          <p className={styles.empty}>Nothing matches “{text}”.</p>
        ) : (
          <div role="listbox" id={listId} aria-label="Results">
            {results.map((group) => (
              <div key={group.name} role="group" aria-label={group.name} className={styles.group}>
                <p className={styles.groupName} aria-hidden="true">
                  {group.name}
                </p>
                {group.items.map((item) => {
                  const index = flat.indexOf(item);
                  return (
                    <div
                      key={item.id}
                      id={optionId(listId, item)}
                      role="option"
                      aria-selected={index === current}
                      className={styles.option}
                      onPointerMove={() => index !== current && setActive(index)}
                      onClick={() => choose(item)}
                    >
                      <span className={styles.icon}>{item.icon ? <item.icon /> : <span />}</span>
                      <span className={styles.label}>
                        <Highlight text={item.label} indices={item.indices} />
                      </span>
                      {item.tone && <ToneMark tone={item.tone} />}
                      {item.hint && <span className={styles.hint}>{item.hint}</span>}
                      {item.keys && (
                        <span className={styles.keys}>
                          {item.keys.split(' ').map((key) => (
                            <Kbd key={key}>{key}</Kbd>
                          ))}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        )}
      </div>

      <footer className={styles.footer}>
        <span>
          <Kbd>↑</Kbd>
          <Kbd>↓</Kbd> move
        </span>
        <span>
          <Kbd>Enter</Kbd> open
        </span>
        <span>
          <Kbd>Esc</Kbd> close
        </span>
      </footer>
    </Dialog>
  );
}

function optionId(listId, item) {
  return `${listId}-${item.id.replace(/[^a-z0-9-]/gi, '-')}`;
}

const SHOWN_BEFORE_TYPING = ['Incidents', 'Pages', 'Demo', 'Actions'];

// With nothing typed: the incidents still open, the pages, the scenarios and the actions.
// With text: every match, best first, groups ordered by their best match.
function rank(items, text, navigate) {
  const query = text.trim();
  if (!query) {
    return SHOWN_BEFORE_TYPING.map((name) => ({
      name,
      items: items.filter((item) => item.group === name && (name !== 'Incidents' || item.recent)).slice(0, PER_GROUP),
    })).filter((group) => group.items.length > 0);
  }

  const scored = [];
  for (const item of items) {
    const match = fuzzyMatch(query, item.label);
    if (match) scored.push({ ...item, score: match.score, indices: match.indices });
  }

  // "41", "inc 41" or "INC-041" opens that incident even when it isn't in the loaded list
  const number = query.match(/^(?:inc[\s-]*)?0*(\d{1,6})$/i)?.[1];
  if (number && !scored.some((item) => item.id === `incident:${number}`)) {
    scored.push({
      id: `incident:${number}`,
      group: 'Incidents',
      label: `Open ${incidentId(number)}`,
      icon: IncidentIcon,
      score: 100,
      run: () => navigate(`/incidents/${number}`),
    });
  }
  if (query.length >= 2) {
    scored.push({
      id: 'runbook-search',
      group: 'Runbooks',
      label: `Search runbooks for “${query}”`,
      hint: 'by meaning',
      icon: SearchIcon,
      score: -1,
      run: () => navigate(`/runbooks?q=${encodeURIComponent(query)}`),
    });
  }

  const groups = new Map();
  for (const item of scored.sort((a, b) => b.score - a.score)) {
    if (!groups.has(item.group)) groups.set(item.group, []);
    const list = groups.get(item.group);
    if (list.length < PER_GROUP) list.push(item);
  }
  return [...groups].map(([name, list]) => ({ name, items: list }));
}

function Highlight({ text, indices = [] }) {
  if (indices.length === 0) return text;
  const marked = new Set(indices);
  const parts = [];
  for (let i = 0; i < text.length; i += 1) {
    const isMatch = marked.has(i);
    const last = parts.at(-1);
    if (last && last.match === isMatch) last.text += text[i];
    else parts.push({ match: isMatch, text: text[i] });
  }
  return parts.map((part, i) => (part.match ? <mark key={i}>{part.text}</mark> : <span key={i}>{part.text}</span>));
}
