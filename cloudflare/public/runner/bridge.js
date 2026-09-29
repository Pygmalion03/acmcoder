// This page runs with a sandboxed, opaque origin. It never receives account data.
const nonce = location.hash.slice(1);
const parentOrigin = new URL(document.referrer || location.href).origin;
let worker = null;
let currentTask = null;

const workerSource = String.raw`
const MAX_OUTPUT = 32768;
let total = 0;
let outputLimited = false;
function append(kind, value, id) {
  const remaining = MAX_OUTPUT - total;
  if (remaining <= 0) { outputLimited = true; return; }
  const text = String(value).slice(0, remaining);
  total += text.length;
  if (text.length < String(value).length) outputLimited = true;
  postMessage({ kind, id, text });
}
onmessage = async ({ data }) => {
  if (data.kind !== 'run' || typeof data.id !== 'string') return;
  const { id, code, stdin } = data;
  try {
    importScripts('https://cdn.jsdelivr.net/pyodide/v0.29.3/full/pyodide.js');
    const pyodide = await loadPyodide({ indexURL: 'https://cdn.jsdelivr.net/pyodide/v0.29.3/full/' });
    const lines = String(stdin).match(/[^\n]*\n|[^\n]+$/g) || [];
    pyodide.setStdin({ stdin: () => lines.shift() ?? null });
    pyodide.setStdout({ batched: value => append('stdout', value + '\n', id) });
    pyodide.setStderr({ batched: value => append('stderr', value + '\n', id) });
    postMessage({ kind: 'running', id });
    await pyodide.runPythonAsync(String(code));
    postMessage({ kind: 'complete', id, outputLimited });
  } catch (error) {
    postMessage({ kind: 'error', id, text: String(error), outputLimited });
  }
};`;

function send(message) {
  window.parent.postMessage({ ...message, nonce }, parentOrigin);
}
function stop() {
  if (worker) worker.terminate();
  worker = null;
  currentTask = null;
}
window.addEventListener('message', event => {
  if (event.source !== window.parent || event.origin !== parentOrigin) return;
  const data = event.data;
  if (!data || data.nonce !== nonce) return;
  if (data.kind === 'stop') { stop(); return; }
  if (data.kind !== 'run' || typeof data.id !== 'string' || typeof data.code !== 'string' || typeof data.stdin !== 'string') return;
  if (data.code.length > 50000 || data.stdin.length > 32000) { send({ kind: 'error', id: data.id, text: '代码或输入超过长度限制。' }); return; }
  stop();
  currentTask = data.id;
  const blob = new Blob([workerSource], { type: 'text/javascript' });
  const url = URL.createObjectURL(blob);
  try { worker = new Worker(url); } catch (error) { URL.revokeObjectURL(url); send({ kind: 'error', id: data.id, text: '无法启动隔离执行环境：' + String(error) }); return; }
  URL.revokeObjectURL(url);
  worker.onmessage = ({ data: reply }) => {
    if (currentTask !== data.id || reply.id !== data.id || !['running', 'stdout', 'stderr', 'complete', 'error'].includes(reply.kind)) return;
    send(reply);
    if (reply.kind === 'complete' || reply.kind === 'error') stop();
  };
  worker.onerror = event => {
    if (currentTask === data.id) send({ kind: 'error', id: data.id, text: event.message || 'Python 加载失败，请重试。' });
    stop();
  };
  worker.postMessage({ kind: 'run', id: data.id, code: data.code, stdin: data.stdin });
});
send({ kind: 'ready' });
