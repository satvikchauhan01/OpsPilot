import styles from './BrandMark.module.css';

export function BrandMark() {
  return (
    <span className={styles.brand}>
      <svg className={styles.glyph} viewBox="0 0 32 32" aria-hidden="true">
        <rect width="32" height="32" rx="5" />
        <path d="M8 21 L15 9 L18 15 L24 11" />
      </svg>
      <span className={styles.word}>OpsPilot</span>
    </span>
  );
}
