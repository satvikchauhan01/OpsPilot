// The rules for changing who is on the team, kept apart from the routes so they can be
// tested on their own.

// Why `actor` may not make `change` ('role' or 'remove') to `target`, or null when they may.
// `admins` is how many admins there are now.
export function teamChangeRefusal({ actor, target, change, role, admins }) {
  if (String(actor.id) === String(target.id)) {
    return change === 'remove' ? 'you cannot remove yourself' : 'you cannot change your own role';
  }
  const losesAdmin = target.role === 'admin' && (change === 'remove' || role !== 'admin');
  if (losesAdmin && admins <= 1) return 'the team needs at least one admin';
  return null;
}
