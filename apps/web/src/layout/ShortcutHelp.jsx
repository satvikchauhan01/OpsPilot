import { useEffect, useRef } from 'react';
import { CloseIcon } from '../components/Icons.jsx';
import styles from './ShortcutHelp.module.css';

const SHORTCUTS = [
  { keys: ['g', 'o'], action: 'Go to the overview' },
  { keys: ['g', 'i'], action: 'Go to incidents' },
  { keys: ['g', 'r'], action: 'Go to runbooks' },
  { keys: ['/'], action: 'Search runbooks (on the runbooks page)' },
  { keys: ['j'], action: 'Next incident in a list' },
  { keys: ['k'], action: 'Previous incident in a list' },
  { keys: ['Enter'], action: 'Open the selected incident' },
  { keys: ['t'], action: 'Switch between dark and light theme' },
  { keys: ['?'], action: 'Show this help' },
  { keys: ['Esc'], action: 'Close this help' },
];

// Native <dialog> gives focus trapping, Esc to close and a backdrop for free.
export function ShortcutHelp({ onClose }) {
  const dialogRef = useRef(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    dialog.showModal();
    return () => dialog.close();
  }, []);

  return (
    <dialog
      ref={dialogRef}
      className={styles.dialog}
      aria-labelledby="shortcuts-title"
      onClose={onClose}
      onClick={(event) => event.target === dialogRef.current && onClose()}
    >
      <header className={styles.header}>
        <h2 id="shortcuts-title">Keyboard shortcuts</h2>
        <button type="button" className={styles.close} onClick={onClose}>
          <CloseIcon label="Close" />
        </button>
      </header>
      <dl className={styles.list}>
        {SHORTCUTS.map(({ keys, action }) => (
          <div key={action} className={styles.row}>
            <dt>
              {keys.map((key, i) => (
                <span key={key}>
                  {i > 0 && <span className={styles.then}>then</span>}
                  <kbd className={styles.key}>{key}</kbd>
                </span>
              ))}
            </dt>
            <dd>{action}</dd>
          </div>
        ))}
      </dl>
    </dialog>
  );
}
