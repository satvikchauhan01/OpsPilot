import { useConsole } from '../layout/ConsoleContext.js';
import { Button, ButtonLink } from '../components/Button.jsx';
import { Kbd } from '../components/Kbd.jsx';
import styles from './NotFoundPage.module.css';

export function NotFoundPage() {
  const { openPalette } = useConsole();
  return (
    <section className={styles.page}>
      <p className={styles.code}>404</p>
      <h1 className={styles.title}>There's nothing at this address</h1>
      <p className={styles.hint}>
        The incident or page may have a different number. Search for it instead, or press <Kbd>Ctrl</Kbd> <Kbd>K</Kbd>{' '}
        anywhere.
      </p>
      <div className={styles.buttons}>
        <Button variant="primary" onClick={openPalette}>
          Search
        </Button>
        <ButtonLink to="/">Back to the overview</ButtonLink>
      </div>
    </section>
  );
}
