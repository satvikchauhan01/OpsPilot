import { useEffect, useState } from 'react';
import styles from './SectionNav.module.css';

// Where a section counts as the one being read: just under the sticky bars.
const READING_LINE = 140;

// A sticky row of links to the incident page's sections. The one being read is marked as
// you scroll, including sections that load late, like the postmortem.
export function SectionNav({ sections }) {
  const [current, setCurrent] = useState(sections[0]?.id);
  const ids = sections.map((section) => section.id).join(',');

  useEffect(() => {
    let frame = 0;
    function update() {
      frame = 0;
      let reading = null;
      for (const id of ids.split(',')) {
        const element = document.getElementById(id);
        if (element && element.getBoundingClientRect().top <= READING_LINE) reading = id;
      }
      setCurrent(reading ?? ids.split(',')[0]);
    }
    function onScroll() {
      if (!frame) frame = requestAnimationFrame(update);
    }
    frame = requestAnimationFrame(update);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', onScroll);
    };
  }, [ids]);

  return (
    <nav className={styles.nav} aria-label="Sections of this incident">
      <ul>
        {sections.map((section) => (
          <li key={section.id}>
            <a href={`#${section.id}`} aria-current={current === section.id ? 'location' : undefined}>
              {section.label}
              {section.badge && <span className={styles.badge}>{section.badge}</span>}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
