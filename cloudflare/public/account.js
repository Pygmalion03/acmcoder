// Cloud data is optional. The browser runner and local drafts work without this API.
let cloudUser = null;
let cloudProblems = [];
let cloudProgress = [];
let cloudPlan = [];
let cloudUnfinished = [];
let cloudDraftVersion = new Map();
let cloudDraftReady = new Set();
let cloudSaving = new Set();
let cloudConflict = null;
let cloudSaveTimers = new Map();
let cloudDirty = new Set();
let cloudSelection = 0;
let editingProblem = null;
let cloudSessionInvalid = false;
let importFailedItems = [];

function cloudInvalidateSession() {
  if (cloudSessionInvalid) return;
  saveDraft();
  cloudSessionInvalid = true;
  cloudSelection++;
  for (const timer of cloudSaveTimers.values()) clearTimeout(timer);
  cloudSaveTimers.clear();
  cloudDraftReady.clear();
  $('draft-status').textContent = '本机已保存 · 账号切换，云端同步已停止';
  cloudNote('账号已在其他标签页切换或退出。本机草稿已保留；刷新页面后可进入当前账号。');
  $('account-state').textContent = '账号已切换 · 请刷新';
}

async function cloudApi(path, options = {}) {
  if (cloudSessionInvalid && path !== 'auth/session') throw new Error('账号已切换，请刷新页面。');
  const boundUser = cloudUser?.id;
  const headers = { ...(options.body ? { 'content-type': 'application/json' } : {}), ...(boundUser && path !== 'auth/session' ? { 'x-acm-expected-user': boundUser } : {}) };
  const response = await fetch(`/api/${path}`, { credentials: 'same-origin', ...options, headers: { ...headers, ...options.headers } });
  const data = await response.json().catch(() => ({ error: '服务响应无效。' }));
  if (data.code === 'account_changed' || (boundUser && response.status === 401)) cloudInvalidateSession();
  if (!response.ok) { const error = new Error(data.error || '请求失败。'); error.status = response.status; error.data = data; throw error; }
  return data;
}
const cloudBody = value => JSON.stringify(value);
function cloudNote(message) { $('sync-notice').hidden = false; $('sync-text').textContent = message; }
function cloudClearNote() {
  $('sync-notice').hidden = true;
  $('remote-preview').hidden = true;
  for (const id of ['migrate-draft', 'show-remote', 'use-remote', 'keep-local']) $(id).hidden = true;
}
function cloudLocal(id) {
  try { return JSON.parse(localStorage.getItem(draftKey(id)) || 'null'); } catch { return null; }
}
function cloudCurrent() { return { code: $('code').value, stdin: $('stdin').value, expected: $('expected').value }; }
function cloudSame(a, b) { return !!a && !!b && fields.every(field => a[field] === b[field]); }
function cloudSetFields(draft) {
  for (const field of fields) $(field).value = draft[field] || '';
  saveDraft();
}
function cloudSnapshotKey(id) { return `acmcoder-cloud-snapshot-v2:${draftScope}:${id}`; }
function cloudRoundBackupKey(id) { return `acmcoder-prior-round:${draftScope}:${id}`; }
function cloudPriorRound(id) {
  try { return JSON.parse(localStorage.getItem(cloudRoundBackupKey(id)) || 'null'); } catch { return null; }
}
function cloudShowRoundBackup(id) {
  const available = !!cloudPriorRound(id);
  $('show-prior-code').hidden = !available;
  $('restore-prior-code').hidden = !available;
  $('prior-code-preview').hidden = true;
}
function cloudBackup(id, draft) {
  try { localStorage.setItem(`acmcoder-conflict:${draftScope}:${id}:${Date.now()}`, JSON.stringify(draft)); } catch { /* browser storage full */ }
}
function cloudGuestDraft(id) {
  try { return JSON.parse(localStorage.getItem(guestDraftKey(id)) || 'null'); } catch { return null; }
}

async function cloudSelectedProblem(id) {
  if (!cloudUser || cloudSessionInvalid) return;
  const selection = ++cloudSelection;
  cloudDraftReady.delete(id);
  cloudConflict = null;
  $('draft-status').textContent = '本机已保存 · 正在核对云端';
  cloudClearNote();
  const beforeRequest = cloudCurrent();
  try {
    const { draft } = await cloudApi(`drafts/${encodeURIComponent(id)}`);
    if (selection !== cloudSelection || problem !== id || cloudSessionInvalid) return;
    cloudDraftReady.add(id);
    const local = cloudLocal(id);
    const editedDuringRequest = !cloudSame(beforeRequest, cloudCurrent());
    if (!draft) {
      cloudDraftVersion.set(id, null);
      $('draft-status').textContent = '本机已保存 · 待同步';
      if (cloudGuestDraft(id)) { cloudNote('访客草稿仍留在本机；可明确选择只迁移当前题目。'); $('migrate-draft').hidden = false; }
      else if (local || editedDuringRequest) cloudDraftChanged(id);
      return;
    }
    cloudDraftVersion.set(id, draft.version);
    const savedSnapshot = (() => { try { return JSON.parse(localStorage.getItem(cloudSnapshotKey(id)) || 'null'); } catch { return null; } })();
    if (!editedDuringRequest && (!local || cloudSame(local, draft) || cloudSame(local, savedSnapshot))) {
      cloudSetFields(draft);
      $('draft-status').textContent = '云端已同步';
      localStorage.setItem(cloudSnapshotKey(id), JSON.stringify(draft));
      if (cloudGuestDraft(id)) { cloudNote('访客草稿仍留在本机；可明确选择只迁移当前题目。'); $('migrate-draft').hidden = false; }
      return;
    }
    cloudConflict = { id, remote: draft };
    $('draft-status').textContent = '冲突 · 本机草稿已保留';
    cloudNote('本机与云端草稿不同，两个版本均已保留。选择后再写入。');
    $('show-remote').hidden = false;
    $('use-remote').hidden = false;
    $('keep-local').hidden = false;
    if (cloudGuestDraft(id)) $('migrate-draft').hidden = false;
  } catch (error) { if (selection === cloudSelection) { $('draft-status').textContent = '本机已保存 · 云端暂不可用'; cloudNote(`云端草稿暂不可用：${error.message}。本机草稿仍保留。`); } }
}
function cloudDraftChanged(id) {
  if (!cloudUser || cloudSessionInvalid || cloudConflict?.id === id) return;
  cloudDirty.add(id);
  if (id === problem) $('draft-status').textContent = '本机已保存 · 待同步';
  if (id === problem && !$('migrate-draft').hidden) return;
  if (!cloudDraftReady.has(id)) return;
  if (cloudSaveTimers.has(id)) clearTimeout(cloudSaveTimers.get(id));
  cloudSaveTimers.set(id, setTimeout(() => { cloudSaveTimers.delete(id); cloudSaveDraft(id); }, 1200));
}
async function cloudSaveDraft(id, forceVersion) {
  if (!cloudUser || cloudSessionInvalid || cloudConflict?.id === id) return;
  if (!cloudDraftReady.has(id) || cloudSaving.has(id)) return;
  const local = cloudLocal(id);
  if (!local) return;
  const baseVersion = forceVersion === undefined ? cloudDraftVersion.get(id) : forceVersion;
  if (baseVersion === undefined) return;
  if (cloudSaveTimers.has(id)) { clearTimeout(cloudSaveTimers.get(id)); cloudSaveTimers.delete(id); }
  cloudSaving.add(id);
  try {
    const result = await cloudApi(`drafts/${encodeURIComponent(id)}`, { method: 'PUT', body: cloudBody({ ...local, baseVersion }) });
    if (cloudSessionInvalid) return;
    cloudDraftVersion.set(id, result.version);
    localStorage.setItem(cloudSnapshotKey(id), JSON.stringify(local));
    if (cloudSame(local, cloudLocal(id))) cloudDirty.delete(id);
    if (problem === id && !cloudDirty.has(id)) $('draft-status').textContent = '云端已同步';
    if (problem === id) cloudClearNote();
  } catch (error) {
    if (cloudSessionInvalid) return;
    if (error.status === 409) {
      cloudConflict = { id, remote: error.data.current };
      if (problem === id) $('draft-status').textContent = '冲突 · 本机草稿已保留';
      if (problem === id) { cloudNote('另一设备已更新草稿；本机版本仍保留。请选择要使用的版本。'); $('show-remote').hidden = false; $('use-remote').hidden = false; $('keep-local').hidden = false; }
    } else if (problem === id) { $('draft-status').textContent = '本机已保存 · 云端同步失败'; cloudNote(`云端保存失败：${error.message}。本机草稿仍保留。`); }
  } finally {
    cloudSaving.delete(id);
    if (!cloudSessionInvalid && !cloudConflict && !cloudSame(local, cloudLocal(id))) cloudDraftChanged(id);
  }
}

function cloudRenderLibrary() {
  const list = $('problem-list');
  list.replaceChildren();
  const q = $('search').value.trim().toLocaleLowerCase();
  const favoritesOnly = $('favorites-only').checked;
  const items = [
    { id: 'sum', title: sample.sum.title, tags: ['示例'], favorite: false },
    { id: 'free', title: sample.free.title, tags: ['自由练习'], favorite: false },
    ...cloudProblems
  ].filter(item => (!favoritesOnly || item.favorite) && (!q || `${item.title} ${(item.tags || []).join(' ')}`.toLocaleLowerCase().includes(q)));
  if (!items.length) { list.textContent = '没有匹配的题目。'; return; }
  for (const item of items) {
    const button = document.createElement('button');
    button.type = 'button'; button.className = 'problem-card';
    const name = document.createElement('strong'); name.textContent = item.title;
    const tags = document.createElement('span'); tags.textContent = `${item.favorite ? '★ ' : ''}${(item.tags || []).join(' · ')}`;
    button.append(name, tags);
    button.addEventListener('click', () => { $('problem-select').value = item.id; loadProblem(item.id); $('practice').scrollIntoView({ behavior: 'smooth' }); });
    list.append(button);
  }
}
async function cloudLoadProblems() {
  const data = await cloudApi('problems');
  cloudProblems = data.problems;
  for (const key of Object.keys(sample)) if (!['sum', 'free'].includes(key)) delete sample[key];
  $('problem-select').replaceChildren(new Option('两个整数相加（原创示例）', 'sum'), new Option('自由练习', 'free'));
  for (const item of cloudProblems) {
    const firstCase = item.cases[0] || { stdin: '', expected: '' };
    sample[item.id] = { title: item.title, description: item.statement || '此题仅收藏了链接，可打开来源或手动补充题面。', sourceUrl: item.sourceUrl, favorite: item.favorite, personal: true, cases: item.cases, code: '# 在这里编写 Python 代码\n', stdin: firstCase.stdin, expected: firstCase.expected };
    $('problem-select').add(new Option(item.title, item.id));
  }
  cloudRenderLibrary();
}
async function cloudLoadProgress() {
  const [progress, plan, recommendations] = await Promise.all([cloudApi('progress'), cloudApi('plans/today'), cloudApi('plans/recommendations')]);
  cloudProgress = progress.progress;
  cloudPlan = plan.plan;
  cloudUnfinished = recommendations.problemIds;
  const progressArea = $('progress-items'); progressArea.replaceChildren();
  $('progress-text').textContent = cloudProgress.length ? '这里记录当前样例的自测结果；它不是平台隐藏测试成绩。' : '还没有自测记录，选择一道题开始练习。';
  for (const item of cloudProgress.slice(0, 12)) {
    const row = document.createElement('div'); row.className = 'practice-row';
    const label = document.createElement('span'); label.textContent = `${sample[item.problemId]?.title || '已删除题目'} · ${item.attempts} 次 · 自测通过 ${item.successes} 次`;
    row.append(label);
    if (sample[item.problemId]) { const redo = document.createElement('button'); redo.textContent = '开始新一轮'; redo.addEventListener('click', async () => {
      $('problem-select').value = item.problemId;
      await loadProblem(item.problemId);
      if (problem !== item.problemId) return;
      if (cloudConflict?.id === item.problemId) { cloudNote('请先处理本机与云端的草稿冲突，再开始新一轮。'); return; }
      const previous = cloudCurrent();
      try { localStorage.setItem(cloudRoundBackupKey(item.problemId), JSON.stringify({ ...previous, savedAt: Date.now() })); }
      catch { cloudNote('本机空间不足，无法保留上次代码；请先自行复制代码。'); return; }
      const key = `acmcoder-practice-round:${draftScope}:${item.problemId}`;
      let next = 1;
      try { next = Number(localStorage.getItem(key) || 0) + 1; localStorage.setItem(key, String(next)); } catch { /* practice remains usable */ }
      $('code').value = '# 从这里开始新一轮练习\n';
      $('stdin').value = sample[item.problemId].stdin || '';
      $('expected').value = sample[item.problemId].expected || '';
      saveDraft();
      cloudDraftChanged(item.problemId);
      cloudShowRoundBackup(item.problemId);
      setResult(`已开始第 ${next} 轮重练，代码已清空；可查看或恢复上次代码。运行后会留下新的自测记录。`);
      $('practice').scrollIntoView({ behavior: 'smooth' });
    }); row.append(redo); }
    progressArea.append(row);
  }
  const planArea = $('plan-items'); planArea.replaceChildren();
  $('plan-text').textContent = cloudPlan.length ? `北京时间 ${plan.day} 的计划可在不同设备继续。` : `北京时间 ${plan.day} 尚未生成计划。`;
  for (const item of cloudPlan) {
    const row = document.createElement('label'); row.className = 'practice-row';
    const check = document.createElement('input'); check.type = 'checkbox'; check.checked = item.completed;
    check.addEventListener('change', async () => { item.completed = check.checked; try { await cloudApi('plans/today', { method: 'PUT', body: cloudBody({ plan: cloudPlan }) }); } catch (error) { check.checked = !check.checked; item.completed = check.checked; alert(error.message); } });
    const label = document.createElement('span'); label.textContent = sample[item.problemId]?.title || '已删除题目';
    row.append(check, label); planArea.append(row);
  }
}
async function cloudRecordResult(id, status, details) {
  if (!cloudUser) return;
  try {
    await cloudApi('submissions', { method: 'POST', body: cloudBody({ problemId: id, status, ...details }) });
    await cloudLoadProgress();
  } catch (error) { cloudNote(`自测已在本机完成，云端记录失败：${error.message}`); }
}

async function cloudInitialize() {
  cloudRenderLibrary();
  try {
    const session = await cloudApi('auth/session');
    cloudUser = session.user;
    if (cloudUser) {
      draftScope = `user:${cloudUser.id}`;
      loadProblem(problem, false);
    }
    $('account-state').textContent = cloudUser ? `@${cloudUser.login}` : '访客 · 草稿存于本机';
    $('login').hidden = !!cloudUser;
    $('logout').hidden = !cloudUser;
    $('export').hidden = !cloudUser;
    $('open-restore').hidden = !cloudUser;
    $('make-plan').hidden = !cloudUser;
    $('delete-account').hidden = !cloudUser;
    if (cloudUser) {
      await cloudLoadProblems();
      const last = localStorage.getItem(lastProblemKey());
      if (last && sample[last] && last !== problem) { $('problem-select').value = last; loadProblem(last, false); }
      else await cloudSelectedProblem(problem);
      await cloudLoadProgress();
    }
  } catch (error) {
    $('account-state').textContent = cloudUser ? `@${cloudUser.login} · 数据暂不可用` : '访客 · 云端暂不可用';
    $('login').hidden = !!cloudUser;
    $('logout').hidden = !cloudUser;
    cloudNote(`云端数据加载失败：${error.message}。本机草稿仍保留；请稍后刷新重试。`);
  }
}

window.ACMCloud = { selectedProblem: cloudSelectedProblem, draftChanged: cloudDraftChanged, recordResult: cloudRecordResult,
  showRoundBackup: cloudShowRoundBackup,
  leavingProblem: id => { if (cloudDirty.has(id)) cloudSaveDraft(id); } };
window.addEventListener('online', () => {
  if (cloudUser && !cloudSessionInvalid && !cloudDraftReady.has(problem)) cloudSelectedProblem(problem);
  for (const id of cloudDirty) cloudDraftChanged(id);
});
document.addEventListener('visibilitychange', async () => {
  if (document.hidden || !cloudUser || cloudSessionInvalid) return;
  try { const session = await cloudApi('auth/session'); if (session.user?.id !== cloudUser.id) cloudInvalidateSession(); } catch { /* offline drafts stay local */ }
});

$('search').addEventListener('input', cloudRenderLibrary);
$('favorites-only').addEventListener('change', cloudRenderLibrary);
$('logout').addEventListener('click', async () => {
  try { await cloudApi('auth/logout', { method: 'POST' }); location.reload(); } catch (error) { alert(error.message); }
});
$('migrate-draft').addEventListener('click', async () => {
  const id = problem;
  const guest = cloudGuestDraft(id);
  if (!guest) { cloudNote('访客草稿已不存在。'); return; }
  if (!confirm(`只将“${sample[id].title}”的本机草稿保存到当前账号？其他本机草稿不会上传。`)) return;
  $('migrate-draft').hidden = true;
  const accountLocal = cloudLocal(id);
  if (accountLocal) cloudBackup(id, accountLocal);
  cloudSetFields(guest);
  const remote = cloudConflict?.id === id ? cloudConflict.remote : null;
  if (remote) {
    cloudNote('访客草稿已复制到当前编辑器。云端草稿也已保留，请选择使用云端或以当前草稿覆盖。');
    return;
  }
  cloudConflict = null;
  await cloudSaveDraft(id, cloudDraftVersion.get(id) ?? null);
});
$('show-remote').addEventListener('click', () => {
  if (!cloudConflict?.remote) return;
  $('remote-preview').textContent = `云端代码：\n${cloudConflict.remote.code}\n\nstdin：\n${cloudConflict.remote.stdin}\n\n期望 stdout：\n${cloudConflict.remote.expected}`;
  $('remote-preview').hidden = false;
});
$('use-remote').addEventListener('click', () => {
  if (!cloudConflict || cloudConflict.id !== problem || !cloudConflict.remote) return;
  cloudBackup(problem, cloudCurrent());
  cloudSetFields(cloudConflict.remote);
  cloudDraftVersion.set(problem, cloudConflict.remote.version);
  localStorage.setItem(cloudSnapshotKey(problem), JSON.stringify(cloudConflict.remote));
  cloudConflict = null; cloudClearNote();
});
$('keep-local').addEventListener('click', async () => {
  if (!cloudConflict || cloudConflict.id !== problem) return;
  const { id, remote } = cloudConflict;
  if (!confirm('确定以当前本机草稿覆盖云端版本？云端旧版会留在本机冲突备份中。')) return;
  if (remote) cloudBackup(id, remote);
  cloudConflict = null;
  await cloudSaveDraft(id, remote?.version ?? null);
});
$('show-prior-code').addEventListener('click', () => {
  const prior = cloudPriorRound(problem);
  if (!prior) return;
  $('prior-code-preview').textContent = prior.code;
  $('prior-code-preview').hidden = false;
});
$('restore-prior-code').addEventListener('click', () => {
  const prior = cloudPriorRound(problem);
  if (!prior || !confirm('用上次代码替换当前编辑器代码？当前版本会另存为本机备份。')) return;
  cloudBackup(problem, cloudCurrent());
  $('code').value = prior.code;
  saveDraft();
  cloudDraftChanged(problem);
  $('prior-code-preview').hidden = true;
});
$('favorite').addEventListener('click', async () => {
  const item = cloudProblems.find(x => x.id === problem);
  if (!item) return;
  try { await cloudApi(`problems/${item.id}`, { method: 'PATCH', body: cloudBody({ favorite: !item.favorite }) }); await cloudLoadProblems(); $('problem-select').value = item.id; loadProblem(item.id); } catch (error) { alert(error.message); }
});
$('delete-problem').addEventListener('click', async () => {
  const item = cloudProblems.find(x => x.id === problem);
  if (!item || !confirm(`删除“${item.title}”及其草稿和进度？已保留的自测历史仍可通过导出取得。`)) return;
  try { await cloudApi(`problems/${item.id}`, { method: 'DELETE' }); await cloudLoadProblems(); $('problem-select').value = 'sum'; loadProblem('sum'); await cloudLoadProgress(); } catch (error) { alert(error.message); }
});
$('make-plan').addEventListener('click', async () => {
  const priority = item => {
    if (cloudUnfinished.includes(item.id)) return 0;
    const progress = cloudProgress.find(x => x.problemId === item.id);
    if (progress && progress.lastStatus !== 'self_pass') return 1;
    if (!progress) return 2;
    return 3;
  };
  const ranked = cloudProblems.slice().sort((a, b) => priority(a) - priority(b) || a.title.localeCompare(b.title, 'zh-CN'));
  const ids = [...ranked.map(x => x.id), 'sum', 'free'].slice(0, 3);
  try { await cloudApi('plans/today', { method: 'PUT', body: cloudBody({ plan: ids.map(problemId => ({ problemId, completed: false })) }) }); await cloudLoadProgress(); } catch (error) { alert(error.message); }
});
$('delete-account').addEventListener('click', async () => {
  if (!confirm('永久删除此免费版账号中的个人题库、草稿、进度和提交记录？建议先导出。')) return;
  try { await cloudApi('account', { method: 'DELETE', body: cloudBody({ confirm: 'DELETE_MY_ACCOUNT' }) }); location.reload(); } catch (error) { alert(error.message); }
});

function cloudOpenDialog(item = null) {
  editingProblem = item;
  importFailedItems = [];
  $('retry-import').hidden = true;
  $('problem-form').reset();
  $('problem-dialog').querySelector('h2').textContent = item ? '编辑题目' : '添加题目';
  $('import-mode').value = item?.sourceKind === 'link' ? 'link' : 'manual';
  $('normal-section').hidden = false; $('json-section').hidden = true;
  $('new-title').value = item?.title || '';
  $('new-url').value = item?.sourceUrl || '';
  $('new-statement').value = item?.statement || '';
  $('new-tags').value = item?.tags?.join(', ') || '';
  $('new-raw').value = item?.rawSamples?.[0] || '';
  $('new-stdin').value = item?.cases?.[0]?.stdin || '';
  $('new-expected').value = item?.cases?.[0]?.expected || '';
  $('extra-samples').replaceChildren();
  const count = Math.max(item?.rawSamples?.length || 0, item?.cases?.length || 0, 1);
  for (let index = 1; index < count; index++) {
    const row = cloudAddSample();
    row.querySelector('.sample-raw').value = item.rawSamples[index] || '';
    row.querySelector('.sample-stdin').value = item.cases[index]?.stdin || '';
    row.querySelector('.sample-expected').value = item.cases[index]?.expected || '';
  }
  cloudSampleLimit();
  $('import-preview').textContent = item ? `已载入全部 ${count} 组样例，可逐项修改。` : '填写信息后点击预览。';
  $('problem-dialog').showModal();
}
function cloudAddSample() {
  const row = document.createElement('div');
  row.className = 'sample-edit';
  row.innerHTML = '<div class="sample-edit-head"><strong>附加样例</strong><button type="button" class="remove-sample">删除本组</button></div><label>原始样例<textarea class="sample-raw" maxlength="16000" spellcheck="false"></textarea></label><div class="input-grid"><label>ACM stdin<textarea class="sample-stdin" maxlength="16000" spellcheck="false"></textarea></label><label>期望 stdout<textarea class="sample-expected" maxlength="16000" spellcheck="false"></textarea></label></div>';
  row.querySelector('.remove-sample').addEventListener('click', () => { row.remove(); cloudSampleLimit(); });
  $('extra-samples').append(row);
  cloudSampleLimit();
  return row;
}
function cloudSampleLimit() { $('add-sample').disabled = $('extra-samples').children.length >= 7; }
$('add-sample').addEventListener('click', cloudAddSample);
function cloudSampleRows() {
  return [
    { raw: $('new-raw').value, stdin: $('new-stdin').value, expected: $('new-expected').value },
    ...Array.from($('extra-samples').children, row => ({
      raw: row.querySelector('.sample-raw').value,
      stdin: row.querySelector('.sample-stdin').value,
      expected: row.querySelector('.sample-expected').value
    }))
  ];
}
$('add-problem').addEventListener('click', () => {
  if (!cloudUser) { alert('请先通过 GitHub 登录，才能将新题保存到私人题库。匿名练习与本机草稿仍可使用。'); return; }
  cloudOpenDialog();
});
$('edit-problem').addEventListener('click', () => {
  const item = cloudProblems.find(x => x.id === problem);
  if (item) cloudOpenDialog(item);
});
$('close-dialog').addEventListener('click', () => $('problem-dialog').close());
$('import-mode').addEventListener('change', () => {
  const jsonMode = $('import-mode').value === 'json';
  $('json-section').hidden = !jsonMode;
  $('normal-section').hidden = jsonMode;
});
$('import-file').addEventListener('change', async event => {
  const file = event.target.files?.[0];
  if (!file) return;
  if (file.size > 16 * 1024 * 1024) { $('import-preview').textContent = 'JSON 文件超过 16 MiB，无法导入。'; return; }
  $('import-json').value = await file.text();
  try { cloudPreviewData(); } catch (error) { $('import-preview').textContent = error.message; }
});

function cloudProblemForm() {
  if ($('import-mode').value === 'json') {
    let parsed;
    try { parsed = JSON.parse($('import-json').value); } catch { throw new Error('JSON 无法解析，请检查格式。'); }
    const items = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.problems) ? parsed.problems : [parsed];
    if (!items.length || items.length > 200 || items.some(item => !item || typeof item !== 'object' || Array.isArray(item))) throw new Error('请提供 1 至 200 道题目的 JSON。');
    return items.map(item => ({ ...item, sourceKind: item.sourceKind || 'json' }));
  }
  const sourceUrl = $('new-url').value.trim();
  if (sourceUrl) {
    const url = new URL(sourceUrl);
    if (url.protocol !== 'https:' || url.username || url.password) throw new Error('来源链接必须是 HTTPS 且不含账户信息。');
  }
  const rows = cloudSampleRows();
  const rawSamples = rows.map(row => row.raw);
  const cases = rows.map(row => ({ stdin: row.stdin, expected: row.expected }));
  while (rawSamples.length && !rawSamples.at(-1)) rawSamples.pop();
  while (cases.length && !cases.at(-1).stdin && !cases.at(-1).expected) cases.pop();
  return {
    title: $('new-title').value.trim(), statement: $('new-statement').value,
    sourceUrl, sourceKind: $('import-mode').value === 'link' && !$('new-statement').value ? 'link' : 'manual',
    tags: $('new-tags').value.split(',').map(x => x.trim()).filter(Boolean),
    rawSamples, cases, favorite: editingProblem?.favorite || false
  };
}
function cloudPreviewData() {
  const items = cloudProblemForm();
  if (Array.isArray(items)) {
    if (items.some(item => typeof item.title !== 'string' || !item.title.trim())) throw new Error('每道题都需要标题。');
    $('import-preview').textContent = `准备检查 ${items.length} 道题：\n${items.map((item, index) => `• ${index + 1}. ${item.title} · ${item.cases?.length || 0} 组 ACM 样例 · ${item.rawSamples?.length || 0} 组原始样例`).join('\n')}\n保存前会逐题验证，重复来源会跳过。`;
    return items;
  }
  if (!items.title || typeof items.title !== 'string') throw new Error('请填写题目标题。');
  const sampleLines = Array.from({ length: Math.max(items.rawSamples.length, items.cases.length) }, (_, index) => {
    const current = items.cases[index];
    return `样例 ${index + 1}\n原始：${items.rawSamples[index] || '（未填写）'}\nACM stdin：${current?.stdin || '（未填写）'}\n期望 stdout：${current?.expected || '（未填写）'}`;
  });
  $('import-preview').textContent = `标题：${items.title}\n来源：${items.sourceUrl || '手动'}\n题面：${String(items.statement || '').slice(0, 2000) || '（仅收藏链接）'}\n${sampleLines.join('\n\n') || '尚无样例。'}`;
  return items;
}
$('preview-problem').addEventListener('click', () => { try { cloudPreviewData(); } catch (error) { $('import-preview').textContent = error.message; } });
$('parse-json').addEventListener('click', () => { try { cloudPreviewData(); } catch (error) { $('import-preview').textContent = error.message; } });
$('fetch-statement').addEventListener('click', async () => {
  try {
    const data = await cloudApi('import/fetch', { method: 'POST', body: cloudBody({ url: $('new-url').value.trim() }) });
    $('new-statement').value = data.statement;
    if (!$('new-title').value.trim()) $('new-title').value = data.title;
    $('fetch-hint').textContent = '公开文本已获取，请核对许可与题面，并预览后保存到私人题库。';
  } catch (error) { $('fetch-hint').textContent = `${error.message} 仍可只收藏链接或手动粘贴题面。`; }
});
$('convert-sample').addEventListener('click', () => {
  try {
    const kind = $('convert-kind').value;
    const raw = $('new-raw').value;
    if (kind === 'raw') { $('new-stdin').value = raw; return; }
    const parsed = JSON.parse(raw);
    if (kind === 'string') { if (typeof parsed !== 'string') throw new Error('需要 JSON 字符串。'); $('new-stdin').value = `${parsed}\n`; }
    else if (kind === 'array') { if (!Array.isArray(parsed) || parsed.some(x => !['number', 'string'].includes(typeof x))) throw new Error('仅支持一维数字或字符串数组。'); $('new-stdin').value = `${parsed.length}\n${parsed.join(' ')}\n`; }
    else if (kind === 'matrix') { if (!Array.isArray(parsed) || !parsed.length || !parsed.every(row => Array.isArray(row) && row.length === parsed[0].length && row.every(x => typeof x === 'number'))) throw new Error('仅支持规则数字矩阵。'); $('new-stdin').value = `${parsed.length} ${parsed[0].length}\n${parsed.map(row => row.join(' ')).join('\n')}\n`; }
    $('import-preview').textContent = '已生成 ACM stdin。请核对并手动填写期望 stdout；链表、树等复杂输入请自行转换。';
  } catch (error) { $('import-preview').textContent = `转换失败：${error.message} 请手动填写 ACM stdin。`; }
});
async function cloudImportBatch(items) {
  const valid = [];
  const failed = [];
  const details = [];
  let added = 0;
  let skipped = 0;
  let last = null;
  $('save-problem').disabled = true;
  $('retry-import').disabled = true;
  try {
    for (const [index, item] of items.entries()) {
      $('import-preview').textContent = `正在验证 ${index + 1}/${items.length} 道题…`;
      try { await cloudApi('import/validate', { method: 'POST', body: cloudBody(item) }); valid.push(item); }
      catch (error) { failed.push(item); details.push(`${index + 1}. ${item.title || '未命名题目'}：${error.message}`); }
    }
    for (const [index, item] of valid.entries()) {
      $('import-preview').textContent = `验证结束，正在保存 ${index + 1}/${valid.length} 道有效题目…`;
      try { last = await cloudApi('problems', { method: 'POST', body: cloudBody(item) }); added++; }
      catch (error) {
        if (error.status === 409) skipped++;
        else { failed.push(item); details.push(`${item.title || '未命名题目'}：${error.message}`); }
      }
    }
    importFailedItems = failed;
    $('retry-import').hidden = failed.length === 0;
    let refreshError = '';
    if (added) {
      try {
        await cloudLoadProblems();
        if (last) { $('problem-select').value = last.problem.id; loadProblem(last.problem.id); }
      } catch (error) { refreshError = `题库刷新失败：${error.message}。刷新页面可查看已保存题目。`; }
    }
    const summary = `导入结束：新增 ${added}、跳过重复 ${skipped}、失败 ${failed.length}。${refreshError}`;
    if (failed.length) $('import-preview').textContent = `${summary}\n${details.join('\n')}\n可修改 JSON 后重新保存，或只重试失败项。`;
    else { $('problem-dialog').close(); cloudNote(summary); }
  } finally { $('save-problem').disabled = false; $('retry-import').disabled = false; }
}
$('retry-import').addEventListener('click', async () => {
  if (!importFailedItems.length) return;
  try { await cloudImportBatch(importFailedItems.slice()); }
  catch (error) { $('import-preview').textContent = `重试失败：${error.message}`; }
});
$('save-problem').addEventListener('click', async () => {
  try {
    const data = cloudPreviewData();
    if (Array.isArray(data) && editingProblem) throw new Error('编辑现有题目时请使用手动题面模式。');
    if (Array.isArray(data)) { await cloudImportBatch(data); return; }
    const result = editingProblem
      ? await cloudApi(`problems/${editingProblem.id}`, { method: 'PATCH', body: cloudBody(data) })
      : await cloudApi('problems', { method: 'POST', body: cloudBody(data) });
    $('problem-dialog').close();
    await cloudLoadProblems();
    $('problem-select').value = result.problem.id; loadProblem(result.problem.id);
  } catch (error) { $('import-preview').textContent = error.status === 409 ? '此题已经收藏过，请在题库中查找。' : `保存失败：${error.message}`; }
});

cloudInitialize();
