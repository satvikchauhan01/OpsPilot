// Every image built from this package starts here. SERVICE is baked in at build time
// (see the Dockerfile) and decides which service actually runs.
const SERVICES = ['gateway', 'checkout', 'payments', 'inventory', 'loadgen'];

const name = process.env.SERVICE;
if (!SERVICES.includes(name)) {
  console.error(`SERVICE must be one of ${SERVICES.join(', ')} (got "${name}")`);
  process.exit(1);
}

// Tracing has to start before express, http and pino are loaded so they get patched.
// The load generator plays the part of real customers, so it stays uninstrumented.
if (name !== 'loadgen') require('./lib/telemetry');

require(`./${name}`);
