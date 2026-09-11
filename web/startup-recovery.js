export function createStartupRecovery({ wire, load, onReady = () => {} }) {
  let wired = false;
  let ready = false;

  function wireOnce() {
    if (wired) {
      return;
    }
    wire();
    wired = true;
  }

  async function initialize() {
    wireOnce();
    await load();
    ready = true;
    onReady();
  }

  async function retry(recover) {
    await recover();
    await initialize();
  }

  return { initialize, isReady: () => ready, retry };
}
