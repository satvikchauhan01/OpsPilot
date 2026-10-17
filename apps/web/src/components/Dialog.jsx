import { useEffect, useRef } from 'react';
import styles from './Dialog.module.css';

/**
 * A modal on the native <dialog>: focus stays inside, Esc closes it and the page behind
 * can't be clicked. `placement` puts it in the middle, near the top (the command palette)
 * or along the right edge as a side sheet.
 */
export function Dialog({ onClose, label, labelledBy, placement = 'center', className = '', children }) {
  const ref = useRef(null);

  useEffect(() => {
    const dialog = ref.current;
    dialog.showModal();
    return () => dialog.close();
  }, []);

  return (
    <dialog
      ref={ref}
      className={`${styles.dialog} ${className}`}
      data-placement={placement}
      aria-label={label}
      aria-labelledby={labelledBy}
      // React's development mode runs every effect twice. The close() in the first cleanup
      // still fires its event after the dialog has opened again, so only a dialog that is
      // really closed tells its owner.
      onClose={() => !ref.current?.open && onClose()}
      onClick={(event) => event.target === ref.current && onClose()}
    >
      <div className={styles.content}>{children}</div>
    </dialog>
  );
}
