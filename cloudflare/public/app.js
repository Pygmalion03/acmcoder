const sample = {
  sum: { title: '两数之和', description: '读取一行中的两个整数，输出它们的和。', code: 'a, b = map(int, input().split())\nprint(a + b)\n', stdin: '3 5\n', expected: '8\n' },
  free: { title: '自由练习', description: '输入、代码和期望输出由你决定。可以用它试验任意 Python 片段。', code: 'name = input()\nprint("你好，" + name)\n', stdin: '世界\n', expected: '你好，世界\n' }
};
const $ = id => document.getElementById(id);
const fields = ['code', 'stdin', 'expected'];
const draftKey = key => `acmcoder-free-draft-v1:${key}`;
let problem = 'sum';
let ready = false;
let active = null;
let timeout = null;
let loadTimeout = null;
let nonce = '';
let sequence = 0;

function setResult(text, state = '') {
  $('result').textContent = text;
  $('result').className = `result ${state}`;
}
function saveDraft() {
  const values = Object.fromEntries(fields.map(field => [field, $(field).value]));
  try { localStorage.setItem(draftKey(problem), JSON.stringify(values)); } catch { $('runner-state').textContent = '本机存储不可用'; }
}
function loadProblem(key) {
  invalidate();
  problem = key;
  const item = sample[key];
  $('problem-title').textContent = item.title;
  $('problem-description').textContent = item.description;
  $('sample-input').textContent = item.stdin.trimEnd();
  $('sample-output').textContent = item.expected.trimEnd();
  let draft = {};
  try { draft = JSON.parse(localStorage.getItem(draftKey(key)) || '{}') || {}; } catch { /* use example */ }
  for (const field of fields) $(field).value = typeof draft[field] === 'string' ? draft[field] : item[field];
  $('stdout').textContent = '';
  $('stderr').textContent = '';
  setResult('编辑代码后点击“运行自测”。');
}
function sandboxMessage(message) {
  $('python-sandbox').contentWindow?.postMessage({ ...message, nonce }, '*');
}
function invalidate() {
  if (timeout) clearTimeout(timeout);
  if (loadTimeout) clearTimeout(loadTimeout);
  timeout = loadTimeout = null;
  if (active) sandboxMessage({ kind: 'stop' });
  active = null;
  $('stop').disabled = true;
  $('run').disabled = false;
}
function resetSandbox() {
  invalidate();
  nonce = crypto.randomUUID();
  ready = false;
  $('runner-state').textContent = '隔离环境准备中';
  $('retry').hidden = true;
  $('python-sandbox').src = `/runner/bridge.html#${nonce}`;
  loadTimeout = setTimeout(() => { if (!ready) { $('runner-state').textContent = '隔离环境加载失败'; $('retry').hidden = false; } }, 10000);
}
function finish(message, state = '') {
  setResult(message, state);
  $('runner-state').textContent = '准备就绪';
  invalidate();
}
function normalized(value) { return value.replace(/\r\n/g, '\n').trimEnd(); }
function run() {
  saveDraft();
  invalidate();
  $('stdout').textContent = '';
  $('stderr').textContent = '';
  if (!ready) { setResult('隔离环境尚未就绪，请稍后重试。', 'failure'); return; }
  const code = $('code').value;
  const stdin = $('stdin').value;
  if (code.length > 50000 || stdin.length > 32000) { setResult('代码或输入超过长度限制。', 'failure'); return; }
  active = `${++sequence}-${crypto.randomUUID()}`;
  $('run').disabled = true;
  $('stop').disabled = false;
  $('runner-state').textContent = '加载 Python 中';
  setResult('正在加载并运行 Python…');
  sandboxMessage({ kind: 'run', id: active, code, stdin });
  const id = active;
  loadTimeout = setTimeout(() => { if (active === id) { finish('Python 加载超时，请检查网络后重试。', 'failure'); $('retry').hidden = false; } }, 30000);
}
window.addEventListener('message', event => {
  if (event.source !== $('python-sandbox').contentWindow || event.origin !== 'null') return;
  const data = event.data;
  if (!data || data.nonce !== nonce) return;
  if (data.kind === 'ready') { ready = true; if (loadTimeout && !active) clearTimeout(loadTimeout); $('runner-state').textContent = '准备就绪'; $('retry').hidden = true; return; }
  if (!active || data.id !== active) return;
  if (data.kind === 'running') {
    if (loadTimeout) clearTimeout(loadTimeout);
    loadTimeout = null;
    $('runner-state').textContent = '运行中';
    const id = active;
    timeout = setTimeout(() => { if (active === id) finish('执行超过 5 秒，已停止。', 'failure'); }, 5000);
  } else if (data.kind === 'stdout' || data.kind === 'stderr') {
    if (typeof data.text === 'string') $(data.kind).textContent += data.text.slice(0, 32768);
  } else if (data.kind === 'error') {
    $('stderr').textContent += String(data.text || '未知错误').slice(0, 32768);
    finish('运行出错，请检查错误信息。', 'failure');
  } else if (data.kind === 'complete') {
    if (data.outputLimited) finish('输出超过 32 KiB 上限，已截断。', 'failure');
    else if (normalized($('stdout').textContent) === normalized($('expected').value)) finish('自测通过 · 当前样例输出一致', 'success');
    else finish('输出不符 · 请检查 stdout 与期望输出', 'failure');
  }
});
$('problem-select').addEventListener('change', event => loadProblem(event.target.value));
for (const field of fields) $(field).addEventListener('input', saveDraft);
$('run').addEventListener('click', run);
$('stop').addEventListener('click', () => { if (active) finish('已停止运行。', 'failure'); });
$('retry').addEventListener('click', resetSandbox);
loadProblem(problem);
resetSandbox();
