// Cleanup hooks that run after the HTTP server has stopped taking traffic,
// e.g. flushing the last batch of spans and logs.
const hooks = [];

function onShutdown(hook) {
  hooks.push(hook);
}

function runShutdownHooks() {
  return Promise.allSettled(hooks.map((hook) => hook()));
}

module.exports = { onShutdown, runShutdownHooks };
