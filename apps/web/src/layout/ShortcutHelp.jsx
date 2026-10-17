import { useAuth } from '../auth/AuthContext.jsx';
import { Dialog } from '../components/Dialog.jsx';
import { Kbd } from '../components/Kbd.jsx';
import { CloseIcon } from '../components/Icons.jsx';
import { sectionsFor } from './navigation.js';
import styles from './ShortcutHelp.module.css';

const ANYWHERE = {
  name: 'Anywhere',
  shortcuts: [
    { keys: ['Ctrl', 'K'], chord: true, action: 'Jump to anything, or run a command' },
    { keys: ['['], action: 'Collapse or expand the sidebar' },
    { keys: ['t'], action: 'Switch between dark and light theme' },
    { keys: ['?'], action: 'Show this help' },
  ],
};

const ON_PAGES = [
  {
    name: 'Lists and pages',
    shortcuts: [
      { keys: ['j'], action: 'Next incident in a list' },
      { keys: ['k'], action: 'Previous incident in a list' },
      { keys: ['Enter'], action: 'Open the selected incident' },
      { keys: ['/'], action: 'Search the runbooks (on the runbooks page)' },
    ],
  },
  {
    name: 'Incident replay',
    shortcuts: [
      { keys: ['Space'], action: 'Play or pause' },
      { keys: ['←'], then: ['→'], action: 'Previous or next event' },
    ],
  },
];

export function ShortcutHelp({ onClose }) {
  const { user } = useAuth();
  const pages = {
    name: 'Go to',
    shortcuts: sectionsFor(user)
      .flatMap((section) => section.items)
      .map((item) => ({ keys: item.keys.split(' '), action: item.label })),
  };
  const groups = [ANYWHERE, pages, ...ON_PAGES];

  return (
    <Dialog onClose={onClose} labelledBy="shortcuts-title" className={styles.dialog}>
      <header className={styles.header}>
        <h2 id="shortcuts-title">Keyboard shortcuts</h2>
        <button type="button" className={styles.close} onClick={onClose}>
          <CloseIcon label="Close" />
        </button>
      </header>
      <div className={styles.groups}>
        {groups.map((group) => (
          <section key={group.name} className={styles.group}>
            <h3 className={styles.groupName}>{group.name}</h3>
            <dl className={styles.list}>
              {group.shortcuts.map(({ keys, chord, then, action }) => (
                <div key={action} className={styles.row}>
                  <dt>
                    {keys.map((key, i) => (
                      <span key={key}>
                        {i > 0 && <span className={styles.then}>{chord ? '+' : 'then'}</span>}
                        <Kbd>{key}</Kbd>
                      </span>
                    ))}
                    {then && (
                      <>
                        <span className={styles.then}>or</span>
                        <Kbd>{then[0]}</Kbd>
                      </>
                    )}
                  </dt>
                  <dd>{action}</dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>
    </Dialog>
  );
}
