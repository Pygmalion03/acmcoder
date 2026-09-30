const nonce = location.hash.slice(1);
let worker;
let current;
function send(data) { parent.postMessage({ ...data, nonce }, '*'); }
addEventListener('message', ({ source, data }) => {
  if (source !== parent || data?.nonce !== nonce) return;
  if (data.type === 'stop') { worker?.terminate(); worker = null; current = null; return; }
  if (data.type !== 'run') return;
  current = data.id;
  if (!worker) {
    const allowed = ['isolated-worker.js', 'clang22', 'lld22', 'sysroot22-standard.tar', 'memfs'];
    if (!Array.isArray(data.resources) || data.resources.length !== allowed.length || !data.resources.every((item, index) => item.name === allowed[index] && item.bytes instanceof ArrayBuffer)) return;
    const url = URL.createObjectURL(new Blob([data.resources[0].bytes], { type: 'text/javascript' }));
    worker = new Worker(url); URL.revokeObjectURL(url);
    worker.onmessage = ({ data: reply }) => {
      if (reply.type === 'phase' || reply.id === current) send(reply);
    };
    worker.onerror = (event) => send({ type: 'result', id: current, error: event.message });
  }
  worker.postMessage(data);
});
send({ type: 'ready' });
