const EMPTY = '—';

export function percent(ratio, digits = 1) {
  if (ratio === null || ratio === undefined) return EMPTY;
  const value = ratio * 100;
  if (value > 0 && value < 0.1) return '<0.1%';
  return `${value.toFixed(value >= 10 || Number.isInteger(value) ? 0 : digits)}%`;
}

export function latency(seconds) {
  if (seconds === null || seconds === undefined) return EMPTY;
  return seconds < 1 ? `${Math.round(seconds * 1000)} ms` : `${seconds.toFixed(seconds < 10 ? 2 : 1)} s`;
}

export function rate(perSecond) {
  if (perSecond === null || perSecond === undefined) return EMPTY;
  return `${perSecond.toFixed(perSecond < 10 ? 1 : 0)}/s`;
}

export function duration(ms) {
  if (ms === null || ms === undefined || ms < 0) return EMPTY;
  const seconds = Math.floor(ms / 1000);
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m`;
  if (m > 0) return `${m}m ${String(s).padStart(2, '0')}s`;
  return `${s}s`;
}

const clockFormat = new Intl.DateTimeFormat(undefined, {
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
});
const shortClockFormat = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit', hour12: false });
const dateTimeFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'medium' });

export function clock(date) {
  return clockFormat.format(new Date(date));
}

export function shortClock(date) {
  return shortClockFormat.format(new Date(date));
}

export function dateTime(date) {
  return dateTimeFormat.format(new Date(date));
}

export function timeAgo(date, now = Date.now()) {
  const seconds = Math.round((now - new Date(date)) / 1000);
  if (seconds < 45) return 'just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  return `${Math.round(hours / 24)} d ago`;
}

export function incidentId(number) {
  return `INC-${String(number).padStart(3, '0')}`;
}
