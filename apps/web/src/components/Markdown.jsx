import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import styles from './Markdown.module.css';

// Headings inside a runbook section sit below the section's own heading.
const COMPONENTS = { h1: 'h4', h2: 'h4', h3: 'h4', h4: 'h5' };

// Markdown rendered without raw HTML, so a runbook or a postmortem can't inject markup into
// the page. `components` maps its elements to others, headings mostly.
export function Markdown({ children, components = COMPONENTS, className = '' }) {
  return (
    <div className={`${styles.markdown} ${className}`}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {children}
      </ReactMarkdown>
    </div>
  );
}
