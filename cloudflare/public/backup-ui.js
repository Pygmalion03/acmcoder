const backupKinds = ['settings', 'problems', 'drafts', 'submissions', 'progress', 'plans'];
const backupLabels = { problems: '题目', drafts: '草稿', submissions: '自测历史', progress: '练习进度', plans: '计划', settings: '设置' };
let restoreFileData = null;
let restoreFileHash = '';
let restorePreviewReady = false;
const report = message => { $('restore-report').textContent = message; };
const fileHash = async text => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))), x => x.toString(16).padStart(2, '0')).join('');
function backupDownload(data) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(data)], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `acmcoder-backup-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
$('export').addEventListener('click', async () => {
  $('export').disabled = true;
  try {
    const manifest = await cloudApi('backup/manifest');
    const data = { schemaVersion: 2, exportedAt: manifest.exportedAt };
    for (const kind of backupKinds) {
      data[kind] = [];
      const limit = kind === 'problems' ? 2 : 5;
      for (let offset = 0; offset < manifest.counts[kind]; offset += limit) {
        const page = await cloudApi(`backup/${kind}?offset=${offset}&limit=${limit}&revision=${manifest.revision}`);
        if (!page.items.length) throw new Error('分页备份内容发生变化，请重新导出。');
        data[kind].push(...page.items);
      }
      if (data[kind].length !== manifest.counts[kind]) throw new Error('分页备份数量发生变化，请重新导出。');
    }
    const final = await cloudApi('backup/manifest');
    if (final.revision !== manifest.revision) throw new Error('导出期间数据发生变化，请重新导出。');
    backupDownload(data);
    cloudNote('完整备份已下载，请妥善保管私有 JSON 文件。');
  } catch (error) { cloudNote(`备份失败：${error.message}`); }
  finally { $('export').disabled = false; }
});
$('open-restore').addEventListener('click', () => $('restore-dialog').showModal());
$('close-restore').addEventListener('click', () => $('restore-dialog').close());
$('restore-file').addEventListener('change', () => { restoreFileData = null; restorePreviewReady = false; $('start-restore').disabled = true; report('文件已选择。点击“检查备份”。'); });

function parseBackup(data) {
  if (!data || (data.schemaVersion !== 1 && data.schemaVersion !== 2)) throw new Error('仅支持本站 schemaVersion 1 或 2 备份。');
  const result = { schemaVersion: data.schemaVersion };
  for (const kind of backupKinds) {
    if (kind === 'settings') {
      result.settings = data.schemaVersion === 1 ? [data.settings || {}] : data.settings;
    } else result[kind] = data[kind];
    if (!Array.isArray(result[kind])) throw new Error(`${backupLabels[kind]}数据缺失或不是数组。`);
    if (result[kind].length > { problems: 200, drafts: 202, submissions: 100, progress: 202, plans: 155, settings: 1 }[kind]) throw new Error(`${backupLabels[kind]}超过本站数量上限。`);
  }
  return result;
}
async function inspectRestore() {
  const file = $('restore-file').files?.[0];
  if (!file) throw new Error('请先选择备份 JSON 文件。');
  const source = await file.text();
  const data = parseBackup(JSON.parse(source));
  const batchId = await fileHash(source);
  const counts = { created: 0, merged: 0, pending: 0, existing: 0, conflict: 0, unmapped: 0, quota: 0, invalid: 0 };
  const problemsReady = [];
  const sourceRecommendationSlugs = (data.settings[0]?.settings?.recommendationCatalog?.entries || []).map(entry => entry.leetcodeSlug).filter(slug => typeof slug === 'string');
  const lines = [];
  let number = 0;
  const total = backupKinds.reduce((n, kind) => n + data[kind].length, 0);
  for (const kind of backupKinds) {
    for (const item of data[kind]) {
      number++;
      report(`正在检查 ${number}/${total} 条…`);
      try {
        const result = await cloudApi('restore/preview', { method: 'POST', body: cloudBody({ schemaVersion: data.schemaVersion, batchId, kind, item, sourceProblemIds: problemsReady, sourceRecommendationSlugs }) });
        counts[result.outcome] = (counts[result.outcome] || 0) + 1;
        if (kind === 'problems' && ['created', 'merged'].includes(result.outcome)) problemsReady.push(result.sourceKey);
        if (!['created', 'merged', 'pending'].includes(result.outcome)) lines.push(`${backupLabels[kind]} ${result.sourceKey}：${result.outcome}`);
      } catch (error) { counts.invalid++; lines.push(`${backupLabels[kind]}：${error.message}`); }
    }
  }
  restoreFileData = data;
  restoreFileHash = batchId;
  restorePreviewReady = counts.invalid === 0;
  $('start-restore').disabled = !restorePreviewReady;
  report(`检查完成，共 ${total} 条。预计新建 ${counts.created}、合并 ${counts.merged}、待映射 ${counts.pending}、跳过现有 ${counts.existing}、冲突 ${counts.conflict}、悬空 ${counts.unmapped}、超额 ${counts.quota}、无效 ${counts.invalid}。\n现有内容不会被覆盖；恢复时还会重新检查配额与映射。${lines.length ? `\n\n${lines.slice(0, 30).join('\n')}${lines.length > 30 ? '\n…' : ''}` : ''}`);
}
$('preview-restore').addEventListener('click', async () => {
  $('preview-restore').disabled = true;
  $('start-restore').disabled = true;
  try { await inspectRestore(); } catch (error) { report(`检查失败：${error.message}`); }
  finally { $('preview-restore').disabled = false; }
});
$('start-restore').addEventListener('click', async () => {
  if (!restorePreviewReady || !restoreFileData) return;
  $('start-restore').disabled = true;
  $('preview-restore').disabled = true;
  const counts = { created: 0, merged: 0, skipped: 0, failed: 0 };
  const lines = [];
  let done = 0;
  const total = backupKinds.reduce((n, kind) => n + restoreFileData[kind].length, 0);
  for (const kind of backupKinds) {
    for (const item of restoreFileData[kind]) {
      done++;
      report(`正在恢复 ${done}/${total} 条…`);
      try {
        const result = await cloudApi('restore', { method: 'POST', body: cloudBody({ schemaVersion: restoreFileData.schemaVersion, batchId: restoreFileHash, kind, item }) });
        if (result.replayed || result.outcome === 'existing') counts.skipped++;
        else if (result.outcome === 'created') counts.created++;
        else if (result.outcome === 'merged') counts.merged++;
        else { counts.skipped++; lines.push(`${backupLabels[kind]} ${result.sourceKey}：${result.outcome}`); }
      } catch (error) { counts.failed++; lines.push(`${backupLabels[kind]}：${error.message}`); }
    }
  }
  report(`恢复结束：新增 ${counts.created}、映射已有 ${counts.merged}、跳过 ${counts.skipped}、失败 ${counts.failed}。${counts.failed ? '请保留原文件，处理后可重新检查并重试。' : ''}${lines.length ? `\n\n${lines.slice(0, 30).join('\n')}${lines.length > 30 ? '\n…' : ''}` : ''}`);
  $('preview-restore').disabled = false;
  restorePreviewReady = false;
  try { await cloudLoadProblems(); await cloudLoadProgress(); } catch (error) { cloudNote(`恢复后刷新数据失败：${error.message}`); }
});
