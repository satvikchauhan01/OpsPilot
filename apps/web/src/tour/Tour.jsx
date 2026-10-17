import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { Button } from '../components/Button.jsx';
import { TOUR_STEPS } from './steps.js';
import styles from './Tour.module.css';

const PAD = 8;
const GAP = 14;
const CARD_WIDTH = 360;
const FIND_FOR_MS = 4000;
const LOOK_EVERY_MS = 100;

/**
 * A walkthrough that dims the page around one element at a time and explains it. Steps can
 * live on different pages: the tour opens the page, waits for the element, and scrolls it
 * into view. Arrow keys move through it and Esc ends it.
 */
export function Tour({ onClose }) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState(null);
  const cardRef = useRef(null);
  const step = TOUR_STEPS[index];
  const last = index === TOUR_STEPS.length - 1;

  useEffect(() => {
    if (step.path && pathname !== step.path) navigate(step.path);
  }, [step, pathname, navigate]);

  // Find the element (the page may still be loading), bring it into view and follow it as
  // the page scrolls or resizes. Without it, the card simply sits in the middle.
  useLayoutEffect(() => {
    let element = null;
    let timer = 0;
    const started = Date.now();

    const measure = () => {
      if (!element?.isConnected) return setRect(null);
      const box = element.getBoundingClientRect();
      setRect(box.width > 0 ? { top: box.top, left: box.left, width: box.width, height: box.height } : null);
    };
    const find = () => {
      element = document.querySelector(`[data-tour="${step.target}"]`);
      if (element) {
        // Only as far as needed: centring an element of the sticky sidebar shifts the page
        element.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        measure();
        // once more after the smooth scroll has settled
        timer = setTimeout(measure, 450);
      } else if (Date.now() - started < FIND_FOR_MS) {
        timer = setTimeout(find, LOOK_EVERY_MS);
      } else {
        setRect(null);
      }
    };

    timer = setTimeout(find, 0);
    window.addEventListener('scroll', measure, true);
    window.addEventListener('resize', measure);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('scroll', measure, true);
      window.removeEventListener('resize', measure);
    };
  }, [step, pathname]);

  useEffect(() => {
    cardRef.current?.focus();
  }, [index]);

  useEffect(() => {
    function onKeyDown(event) {
      if (event.key === 'Escape') onClose();
      else if (event.key === 'ArrowRight') setIndex((current) => Math.min(current + 1, TOUR_STEPS.length - 1));
      else if (event.key === 'ArrowLeft') setIndex((current) => Math.max(current - 1, 0));
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  return (
    <div className={styles.tour}>
      {rect ? (
        <div
          className={styles.spotlight}
          style={{
            top: rect.top - PAD,
            left: rect.left - PAD,
            width: rect.width + PAD * 2,
            height: rect.height + PAD * 2,
          }}
          aria-hidden="true"
        />
      ) : (
        <div className={styles.dim} aria-hidden="true" />
      )}

      <section
        ref={cardRef}
        className={styles.card}
        style={placeCard(rect)}
        role="dialog"
        aria-labelledby="tour-title"
        aria-describedby="tour-body"
        tabIndex={-1}
      >
        <p className={styles.count}>
          {index + 1} of {TOUR_STEPS.length}
        </p>
        <h2 id="tour-title" className={styles.title}>
          {step.title}
        </h2>
        <p id="tour-body" className={styles.body}>
          {step.body}
        </p>
        <ol className={styles.dots} aria-hidden="true">
          {TOUR_STEPS.map((entry, i) => (
            <li key={entry.title} data-state={i < index ? 'done' : i === index ? 'current' : undefined} />
          ))}
        </ol>
        <div className={styles.buttons}>
          <button type="button" className={styles.skip} onClick={onClose}>
            {last ? 'Close' : 'Skip the tour'}
          </button>
          {index > 0 && (
            <Button size="sm" onClick={() => setIndex(index - 1)}>
              Back
            </Button>
          )}
          <Button size="sm" variant="primary" onClick={() => (last ? onClose() : setIndex(index + 1))}>
            {last ? 'Done' : 'Next'}
          </Button>
        </div>
      </section>
    </div>
  );
}

// Below the element when it fits, above it otherwise, kept inside the window.
function placeCard(rect) {
  if (!rect) return { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' };
  const width = Math.min(CARD_WIDTH, window.innerWidth - 32);
  const left = Math.min(Math.max(16, rect.left), window.innerWidth - width - 16);
  const below = rect.top + rect.height + PAD + GAP;
  if (below + 230 < window.innerHeight) return { top: below, left, width };
  const above = rect.top - PAD - GAP;
  if (above > 250) return { top: above, left, width, transform: 'translateY(-100%)' };
  return { bottom: 16, left, width };
}
