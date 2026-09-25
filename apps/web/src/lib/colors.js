// Each service keeps the same series colour everywhere, whatever else is on screen.
// Colour follows the entity, never its rank. The demo shop's services take the first four
// palette slots, and any other service gets a stable slot from its name.
const KNOWN = { gateway: 1, checkout: 2, payments: 3, inventory: 4 };
const EXTRA_SLOTS = [5, 6, 7, 8];

export function serviceSlot(service) {
  if (KNOWN[service]) return KNOWN[service];
  let hash = 0;
  for (const char of service) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return EXTRA_SLOTS[hash % EXTRA_SLOTS.length];
}

export function serviceColor(service) {
  return `var(--series-${serviceSlot(service)})`;
}
