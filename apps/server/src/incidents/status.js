export const INCIDENT_STATUSES = ['open', 'investigating', 'mitigating', 'resolved'];

// A resolved incident stays closed. If the problem comes back, new alerts open a new
// incident, and the timeline of the old one stays accurate.
const TRANSITIONS = {
  open: ['investigating', 'mitigating', 'resolved'],
  investigating: ['mitigating', 'resolved'],
  mitigating: ['investigating', 'resolved'],
  resolved: [],
};

export function canTransition(from, to) {
  return TRANSITIONS[from]?.includes(to) ?? false;
}
