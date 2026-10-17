import { clock, duration } from '../lib/format.js';
import { Segmented } from '../components/Segmented.jsx';
import { PauseIcon, PlayIcon, SkipBackIcon, SkipForwardIcon } from '../components/Icons.jsx';
import styles from './Scrubber.module.css';

const SPEEDS = [10, 30, 60, 120].map((value) => ({ value, label: `${value}×` }));

const TICK_TONE = {
  alert: 'warning',
  change: 'info',
  k8s: 'neutral',
  incident: 'ink',
  investigation: 'info',
  action: 'signal',
};

// The replay's transport: play and pause, step between events, change speed, and a track
// with every event on it that can be dragged like a video's.
export function Scrubber({ range, time, playing, speed, events, incidentSpan, onPlay, onSeek, onSpeed, onStep }) {
  const span = range.end - range.start;
  const at = (value) => `${((value - range.start) / span) * 100}%`;
  const done = time >= range.end;

  return (
    <section className={styles.scrubber} aria-label="Replay controls">
      <div className={styles.controls}>
        <button
          type="button"
          className={styles.play}
          onClick={onPlay}
          aria-label={playing ? 'Pause (Space)' : done ? 'Play again (Space)' : 'Play (Space)'}
        >
          {playing ? <PauseIcon size={18} /> : <PlayIcon size={18} />}
        </button>
        <button type="button" className={styles.step} onClick={() => onStep(-1)} aria-label="Previous event (←)">
          <SkipBackIcon />
        </button>
        <button type="button" className={styles.step} onClick={() => onStep(1)} aria-label="Next event (→)">
          <SkipForwardIcon />
        </button>

        <div className={styles.clock} aria-live="off">
          <span className={styles.time}>{clock(time)}</span>
          <span className={styles.offset}>
            {time < incidentSpan.from ? '−' : '+'}
            {duration(Math.abs(time - incidentSpan.from))} {time < incidentSpan.from ? 'before' : 'since'} the first
            alert
          </span>
        </div>

        <Segmented label="Speed" size="sm" options={SPEEDS} value={speed} onChange={onSpeed} />
      </div>

      <div className={styles.track}>
        <span
          className={styles.incident}
          style={{ left: at(incidentSpan.from), width: `calc(${at(incidentSpan.to)} - ${at(incidentSpan.from)})` }}
          aria-hidden="true"
        />
        <span className={styles.played} style={{ width: at(time) }} aria-hidden="true" />
        {events.map((event) => (
          <span
            key={event.id}
            className={styles.tick}
            data-tone={event.kind === 'alert' ? event.tone : TICK_TONE[event.kind]}
            data-past={new Date(event.at).getTime() <= time || undefined}
            style={{ left: at(new Date(event.at).getTime()) }}
            title={`${clock(event.at)} · ${event.title}`}
            aria-hidden="true"
          />
        ))}
        <input
          type="range"
          className={styles.range}
          min={range.start}
          max={range.end}
          step={1000}
          value={time}
          onChange={(event) => onSeek(Number(event.target.value))}
          aria-label="Replay position"
          aria-valuetext={clock(time)}
        />
      </div>
      <div className={styles.ends} aria-hidden="true">
        <span>{clock(range.start)}</span>
        <span>{clock(range.end)}</span>
      </div>
    </section>
  );
}
