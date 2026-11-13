/**
 * Runs async tasks strictly one at a time, in submission order.
 * Adobe apps execute one script at a time; overlapping AppleEvents just block
 * each other and make timeouts unpredictable, so every bridge call goes through here.
 */
export function createSerialQueue() {
  let tail = Promise.resolve();
  let depth = 0;

  function run(task) {
    depth += 1;
    const result = tail.then(() => task());
    // Keep the chain alive whether the task succeeds or fails.
    tail = result.then(
      () => undefined,
      () => undefined,
    );
    return result.finally(() => {
      depth -= 1;
    });
  }

  return Object.freeze({
    run,
    get size() {
      return depth;
    },
  });
}
