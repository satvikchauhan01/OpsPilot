// Runs async jobs one at a time, in the order they were queued. A failed job doesn't
// block the ones behind it.
export function createSerialQueue() {
  let tail = Promise.resolve();

  return function enqueue(job) {
    const run = tail.then(job);
    tail = run.catch(() => {});
    return run;
  };
}
