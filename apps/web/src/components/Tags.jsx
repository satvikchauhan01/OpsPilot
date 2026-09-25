import { serviceColor } from '../lib/colors.js';
import styles from './Tags.module.css';

const SEVERITY_LABEL = { critical: 'Critical', warning: 'Warning', info: 'Info' };
const STATUS_LABEL = { open: 'Open', investigating: 'Investigating', mitigating: 'Mitigating', resolved: 'Resolved' };
const STATUS_TONE = { open: 'critical', investigating: 'info', mitigating: 'warning', resolved: 'ok' };

// Status colours always travel with a shape and a word: square for critical, triangle for
// warning, circle for ok, diamond for info. Nothing depends on telling colours apart.
export function ToneMark({ tone }) {
  return <span className={styles.mark} data-tone={tone} aria-hidden="true" />;
}

export function SeverityTag({ severity }) {
  return (
    <span className={styles.tag} data-tone={severity}>
      <ToneMark tone={severity} />
      {SEVERITY_LABEL[severity] ?? severity}
    </span>
  );
}

export function StatusTag({ status }) {
  return (
    <span className={styles.status} data-tone={STATUS_TONE[status]}>
      {STATUS_LABEL[status] ?? status}
    </span>
  );
}

export function HealthTag({ status }) {
  const tone = status === 'ok' ? 'ok' : status;
  return (
    <span className={styles.tag} data-tone={tone}>
      <ToneMark tone={tone} />
      {status === 'ok' ? 'Healthy' : SEVERITY_LABEL[status]}
    </span>
  );
}

export function ServiceChip({ service, emphasis }) {
  return (
    <span className={styles.service} data-emphasis={emphasis || undefined}>
      <span className={styles.swatch} style={{ background: serviceColor(service) }} aria-hidden="true" />
      {service}
    </span>
  );
}
