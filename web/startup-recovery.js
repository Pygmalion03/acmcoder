export function createStartupRecovery({ wire, load }) {
  let wired = false;

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
  }

  async function retry(recover) {
    await recover();
    await initialize();
  }

  return { initialize, retry };
}
