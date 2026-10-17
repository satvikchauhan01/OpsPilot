import { incidentId } from '../lib/format.js';
import { ACTION_LABEL } from '../lib/labels.js';

// Fix updates worth interrupting someone for. Approved and verifying are steps of the same
// story and stay quiet; the timeline has them.
const FIX_NEWS = {
  proposed: { tone: 'warning', title: 'Fix waiting for approval', urgent: true },
  running: { tone: 'info', title: 'Fix rolling out' },
  verified: { tone: 'ok', title: 'Fix verified' },
  failed: { tone: 'critical', title: 'Fix failed', urgent: true },
  rejected: { tone: 'neutral', title: 'Fix rejected' },
};

const POSTMORTEM_NEWS = {
  draft: { tone: 'info', title: 'Postmortem draft', detail: 'Written from the incident data, ready to review.' },
  final: { tone: 'ok', title: 'Postmortem made final', detail: 'It is now part of incident memory.' },
  failed: { tone: 'warning', title: 'Postmortem not written', detail: 'A responder can ask for it again.' },
};

/**
 * Turns a live server event into a toast, or null when it isn't news. `key` names the news
 * itself: the server sends an event for every small update, so the same key arriving twice
 * is shown once. `urgent` news also reaches the system's notifications when the tab is in the
 * background, if the person turned those on.
 */
export function toastForEvent(type, data) {
  const incident = (number, anchor = '') => ({ to: `/incidents/${number}${anchor}`, label: incidentId(number) });

  if (type === 'incident.created') {
    return {
      key: `incident-${data.number}-opened`,
      tone: data.severity,
      title: `${incidentId(data.number)} opened`,
      detail: data.title,
      link: incident(data.number),
      urgent: true,
    };
  }
  if (type === 'incident.updated' && data.status === 'resolved') {
    return {
      key: `incident-${data.number}-resolved`,
      tone: 'ok',
      title: `${incidentId(data.number)} resolved`,
      detail: data.title,
      link: incident(data.number),
    };
  }
  if (type === 'investigation.updated' && data.status === 'completed') {
    return {
      key: `investigation-${data.id}-done`,
      tone: 'info',
      title: `Root cause for ${incidentId(data.incidentNumber)}`,
      detail: data.finding ?? 'The AI investigation is done.',
      link: incident(data.incidentNumber, '#investigation'),
    };
  }
  if (type === 'investigation.updated' && data.status === 'failed') {
    return {
      key: `investigation-${data.id}-failed`,
      tone: 'warning',
      title: `Investigation of ${incidentId(data.incidentNumber)} stopped`,
      link: incident(data.incidentNumber, '#investigation'),
    };
  }
  if (type === 'action.updated' && FIX_NEWS[data.status]) {
    const news = FIX_NEWS[data.status];
    return {
      key: `action-${data.id}-${data.status}`,
      ...news,
      title: `${news.title} · ${incidentId(data.incidentNumber)}`,
      detail: data.type && `${ACTION_LABEL[data.type]} ${data.service}`,
      link: incident(data.incidentNumber, '#remediation'),
    };
  }
  if (type === 'postmortem.updated' && POSTMORTEM_NEWS[data.status]) {
    const news = POSTMORTEM_NEWS[data.status];
    return {
      key: `postmortem-${data.incidentNumber}-${data.status}`,
      ...news,
      title: `${news.title} · ${incidentId(data.incidentNumber)}`,
      link: incident(data.incidentNumber, '#postmortem'),
    };
  }
  return null;
}
