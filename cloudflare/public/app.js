const sample = {
  sum: { title: '两个整数相加', description: '读取一行中的两个整数，输出它们的和。', code: 'a, b = map(int, input().split())\nprint(a + b)\n', stdin: '3 5\n', expected: '8\n' },
  free: { title: '自由练习', description: '输入、代码和期望输出由你决定。可以用它试验任意 Python 片段。', code: 'name = input()\nprint("你好，" + name)\n', stdin: '世界\n', expected: '你好，世界\n' }
};
const $ = id => document.getElementById(id);
const fields = ['code', 'stdin', 'expected'];
// Keep the M1 guest key so existing anonymous drafts remain available.
let draftScope = 'guest';
const guestDraftKey = key => `acmcoder-free-draft-v1:${key}`;
const draftKey = key => draftScope === 'guest' ? guestDraftKey(key) : `acmcoder-free-draft-v2:${draftScope}:${key}`;
const lastProblemKey = () => draftScope === 'guest' ? 'acmcoder-last-problem' : `acmcoder-last-problem:${draftScope}`;
let problem = 'sum';
let ready = false;
let active = null;
let timeout = null;
let loadTimeout = null;
let bridgeTimeout = null;
let nonce = '';
let sequence = 0;
let runQueue = null;

function setResult(text, state = '') {
  $('result').textContent = text;
  $('result').className = `result ${state}`;
}
function saveDraft() {
  const values = Object.fromEntries(fields.map(field => [field, $(field).value]));
  try { localStorage.setItem(draftKey(problem), JSON.stringify(values)); $('draft-status').textContent = '本机已保存'; }
  catch { $('runner-state').textContent = '本机存储不可用'; $('draft-status').textContent = '本机保存失败'; }
}
function loadProblem(key, remember = true) {
  if (key !== problem) { saveDraft(); window.ACMCloud?.leavingProblem(problem); }
  runQueue = null;
  invalidate();
  problem = key;
  if (remember) { try { localStorage.setItem(lastProblemKey(), key); } catch { /* storage unavailable */ } }
  const item = sample[key];
  $('problem-title').textContent = item.title;
  $('problem-description').textContent = item.description;
  $('problem-source').hidden = !item.sourceUrl;
  if (item.sourceUrl) $('problem-source').href = item.sourceUrl;
  $('favorite').hidden = !item.personal;
  $('edit-problem').hidden = !item.personal;
  $('delete-problem').hidden = !item.personal;
  if (item.personal) $('favorite').textContent = item.favorite ? '取消收藏' : '收藏';
  $('sample-input').textContent = item.stdin.trimEnd();
  $('sample-output').textContent = item.expected.trimEnd();
  let draft = {};
  try { draft = JSON.parse(localStorage.getItem(draftKey(key)) || '{}') || {}; } catch { /* use example */ }
  for (const field of fields) $(field).value = typeof draft[field] === 'string' ? draft[field] : item[field];
  $('draft-status').textContent = '本机已保存';
  $('stdout').textContent = '';
  $('stderr').textContent = '';
  $('case-results').replaceChildren();
  window.ACMCloud?.showRoundBackup?.(key);
  setResult('编辑代码后点击“运行自测”。');
  return window.ACMCloud?.selectedProblem(key);
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
  $('run-all').disabled = false;
}
function resetSandbox() {
  runQueue = null;
  invalidate();
  if (bridgeTimeout) clearTimeout(bridgeTimeout);
  nonce = crypto.randomUUID();
  ready = false;
  $('runner-state').textContent = '隔离环境准备中';
  $('retry').hidden = true;
  $('python-sandbox').src = `/runner/bridge.html#${nonce}`;
  bridgeTimeout = setTimeout(() => { if (!ready) { $('runner-state').textContent = '隔离环境加载失败'; $('retry').hidden = false; setResult('隔离环境未能启动，请点击“重新加载 Python”。', 'failure'); } }, 10000);
}
function finish(message, state = '', recordStatus = null) {
  setResult(message, state);
  $('runner-state').textContent = '准备就绪';
  if (recordStatus) window.ACMCloud?.recordResult(problem, recordStatus, { code: $('code').value, stdout: $('stdout').textContent, stderr: $('stderr').textContent });
  invalidate();
}
function normalized(value) { return value.replace(/\r\n/g, '\n').trimEnd(); }
function run() {
  runQueue = null;
  saveDraft();
  if (!ready) { resetSandbox(); setResult('隔离环境正在重新加载，请稍后运行；若仍失败可点击“重新加载 Python”。', 'failure'); return; }
  invalidate();
  $('stdout').textContent = '';
  $('stderr').textContent = '';
  const code = $('code').value;
  const stdin = $('stdin').value;
  if (code.length > 50000 || stdin.length > 32000) { setResult('代码或输入超过长度限制。', 'failure'); return; }
  active = `${++sequence}-${crypto.randomUUID()}`;
  $('run').disabled = true;
  $('run-all').disabled = true;
  $('stop').disabled = false;
  $('runner-state').textContent = '加载 Python 中';
  setResult('正在加载并运行 Python…');
  sandboxMessage({ kind: 'run', id: active, code, stdin });
  const id = active;
  loadTimeout = setTimeout(() => { if (active === id) { finish('Python 加载超时，请检查网络后重试。', 'failure'); $('retry').hidden = false; } }, 30000);
}
function showCaseResult(index, entry, actual, error, state) {
  const row = document.createElement('div');
  row.className = `case-result ${state}`;
  const label = document.createElement('strong');
  label.textContent = `样例 ${index + 1} · ${state === 'success' ? '通过' : '未通过'}`;
  const details = document.createElement('pre');
  details.textContent = `输入：\n${entry.stdin}\n期望：\n${entry.expected}\n实际：\n${actual || '（空）'}${error ? `\n错误：\n${error}` : ''}`;
  row.append(label, details);
  $('case-results').append(row);
}
function runNextCase() {
  const queue = runQueue;
  if (!queue || queue.problemId !== problem) return;
  const current = queue.cases[queue.index];
  $('stdout').textContent = '';
  $('stderr').textContent = '';
  active = `${++sequence}-${crypto.randomUUID()}`;
  $('run').disabled = true;
  $('run-all').disabled = true;
  $('stop').disabled = false;
  $('runner-state').textContent = '加载 Python 中';
  setResult(`正在运行样例 ${queue.index + 1}/${queue.cases.length}…`);
  sandboxMessage({ kind: 'run', id: active, code: queue.code, stdin: current.stdin });
  const id = active;
  loadTimeout = setTimeout(() => { if (active === id) { completeQueuedCase('加载超时'); $('retry').hidden = false; } }, 30000);
}
function completeQueuedCase(error = '') {
  const queue = runQueue;
  if (!queue || queue.problemId !== problem) return;
  const entry = queue.cases[queue.index];
  const actual = $('stdout').textContent;
  const stderr = $('stderr').textContent;
  const passed = !error && !stderr && normalized(actual) === normalized(entry.expected);
  showCaseResult(queue.index, entry, actual, error || stderr, passed ? 'success' : 'failure');
  queue.results.push({ actual, error: error || stderr, passed });
  invalidate();
  if (++queue.index < queue.cases.length) { runNextCase(); return; }
  runQueue = null;
  const passedCount = queue.results.filter(item => item.passed).length;
  const allPassed = passedCount === queue.cases.length;
  $('runner-state').textContent = '准备就绪';
  setResult(`全部样例运行结束：${passedCount}/${queue.cases.length} 组通过。`, allPassed ? 'success' : 'failure');
  window.ACMCloud?.recordResult(queue.problemId, allPassed ? 'self_pass' : 'self_fail', {
    code: queue.code,
    stdout: queue.results.map((item, index) => `样例 ${index + 1}: ${item.actual}`).join('\n').slice(0, 32768),
    stderr: queue.results.map((item, index) => item.error ? `样例 ${index + 1}: ${item.error}` : '').filter(Boolean).join('\n').slice(0, 32768)
  });
}
function runAll() {
  saveDraft();
  if (!ready) { resetSandbox(); setResult('隔离环境正在重新加载，请稍后重试。', 'failure'); return; }
  const code = $('code').value;
  const cases = (sample[problem].cases?.length ? sample[problem].cases : [{ stdin: $('stdin').value, expected: $('expected').value }])
    .map(item => ({ stdin: item.stdin, expected: item.expected }));
  if (code.length > 50000 || cases.some(item => item.stdin.length > 32000)) { setResult('代码或样例输入超过长度限制。', 'failure'); return; }
  invalidate();
  $('case-results').replaceChildren();
  runQueue = { problemId: problem, code, cases, index: 0, results: [] };
  runNextCase();
}
window.addEventListener('message', event => {
  if (event.source !== $('python-sandbox').contentWindow || event.origin !== 'null') return;
  const data = event.data;
  if (!data || data.nonce !== nonce) return;
  if (data.kind === 'ready') { ready = true; if (bridgeTimeout) clearTimeout(bridgeTimeout); bridgeTimeout = null; $('runner-state').textContent = '准备就绪'; $('retry').hidden = true; return; }
  if (!active || data.id !== active) return;
  if (data.kind === 'running') {
    if (loadTimeout) clearTimeout(loadTimeout);
    loadTimeout = null;
    $('runner-state').textContent = '运行中';
    const id = active;
    timeout = setTimeout(() => { if (active === id) { if (runQueue) completeQueuedCase('执行超过 5 秒，已停止。'); else finish('执行超过 5 秒，已停止。', 'failure', 'stopped'); } }, 5000);
  } else if (data.kind === 'stdout' || data.kind === 'stderr') {
    if (typeof data.text === 'string') $(data.kind).textContent += data.text.slice(0, 32768);
  } else if (data.kind === 'error') {
    $('stderr').textContent += String(data.text || '未知错误').slice(0, 32768);
    if (runQueue) completeQueuedCase('运行出错。');
    else finish('运行出错，请检查错误信息。', 'failure', 'error');
  } else if (data.kind === 'complete') {
    if (runQueue) completeQueuedCase(data.outputLimited ? '输出超过 32 KiB 上限，已截断。' : '');
    else if (data.outputLimited) finish('输出超过 32 KiB 上限，已截断。', 'failure', 'error');
    else if (normalized($('stdout').textContent) === normalized($('expected').value)) finish('自测通过 · 当前样例输出一致', 'success', 'self_pass');
    else finish('输出不符 · 请检查 stdout 与期望输出', 'failure', 'self_fail');
  }
});
$('problem-select').addEventListener('change', event => loadProblem(event.target.value));
for (const field of fields) $(field).addEventListener('input', () => { saveDraft(); window.ACMCloud?.draftChanged(problem); });
$('run').addEventListener('click', run);
$('run-all').addEventListener('click', runAll);
$('stop').addEventListener('click', () => { if (active) { runQueue = null; finish('已停止运行。', 'failure', 'stopped'); } });
$('retry').addEventListener('click', resetSandbox);
const lastProblem = (() => { try { return localStorage.getItem(lastProblemKey()); } catch { return null; } })();
if (lastProblem && sample[lastProblem]) problem = lastProblem;
$('problem-select').value = problem;
loadProblem(problem, false);
resetSandbox();
