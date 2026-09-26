import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import styles from './Markdown.module.css';

// Headings inside a runbook section sit below the section's own heading.
const COMPONENTS = { h1: 'h4', h2: 'h4', h3: 'h4', h4: 'h5' };

// Runbook Markdown, rendered without raw HTML, so a runbook can't inject markup into the page.
export function Markdown({ children }) {
  return (
    <div className={styles.markdown}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={COMPONENTS}>
        {children}
      </ReactMarkdown>
    </div>
  );
}
