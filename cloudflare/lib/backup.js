import { InputError, normalizeProblem, problemFromRow } from './problem.js';

export const BACKUP_KINDS = ['problems', 'drafts', 'submissions', 'progress', 'plans', 'settings'];
const MAX = { problems: 200, drafts: 202, submissions: 100, progress: 202, plans: 155, settings: 1 };
const MAX_ITEM_BYTES = 1800 * 1024;
const ID = /^[a-zA-Z0-9_-]{1,80}$/;
const BATCH = /^[0-9a-f]{64}$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const int = (value, name, min = 0, max = 9999999999) => {
  if (!Number.isSafeInteger(value) || value < min || value > max) throw new InputError(`${name}无效。`);
  return value;
};
const str = (value, name, max) => {
  if (typeof value !== 'string' || value.length > max) throw new InputError(`${name}无效或超长。`);
  return value;
};
const id = (value, name = '题目 ID') => { if (typeof value !== 'string' || !ID.test(value)) throw new InputError(`${name}无效。`); return value; };
const attr = (row, camel, snake) => row[camel] ?? row[snake];
const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
const object = value => !!value && typeof value === 'object' && !Array.isArray(value);

export function normalizeBackupItem(kind, row) {
  if (!BACKUP_KINDS.includes(kind) || !object(row)) throw new InputError('备份条目格式无效。');
  if (kind === 'problems') return { id: id(row.id), ...normalizeProblem(row) };
  if (kind === 'drafts') return {
    problemId: id(attr(row, 'problemId', 'problem_id')),
    code: str(row.code, '草稿代码', 50000), stdin: str(row.stdin, '草稿输入', 16000),
    expected: str(row.expected, '草稿期望输出', 16000)
  };
  if (kind === 'submissions') return {
    id: id(row.id, '记录 ID'), problemId: id(attr(row, 'problemId', 'problem_id')),
    status: (() => { if (!['self_pass', 'self_fail', 'error', 'stopped'].includes(row.status)) throw new InputError('自测状态无效。'); return row.status; })(),
    code: str(row.code, '记录代码', 50000), stdout: str(row.stdout, '标准输出', 32768),
    stderr: str(row.stderr, '错误输出', 32768), createdAt: int(attr(row, 'createdAt', 'created_at'), '记录时间')
  };
  if (kind === 'progress') return {
    problemId: id(attr(row, 'problemId', 'problem_id')),
    attempts: int(row.attempts, '练习次数', 0, 1000000), successes: int(row.successes, '通过次数', 0, 1000000),
    lastStatus: str(attr(row, 'lastStatus', 'last_status'), '练习状态', 30),
    lastPracticedAt: int(attr(row, 'lastPracticedAt', 'last_practiced_at'), '练习时间')
  };
  if (kind === 'plans') return {
    day: (() => { const day = str(row.day, '计划日期', 10); if (!DAY.test(day) || Number.isNaN(Date.parse(day))) throw new InputError('计划日期无效。'); return day; })(),
    problemId: id(attr(row, 'problemId', 'problem_id')),
    completed: row.completed === true || row.completed === 1
  };
  const settings = own(row, 'settings') ? row.settings : row;
  if (!object(settings) || JSON.stringify(settings).length > 8000) throw new InputError('设置无效或超长。');
  return { settings };
}
export function sourceKey(kind, item) {
  if (kind === 'problems' || kind === 'submissions') return item.id;
  if (kind === 'plans') return `${item.day}:${item.problemId}`;
  if (kind === 'settings') return 'settings';
  return item.problemId;
}
async function hash(value) {
  const bytes = new TextEncoder().encode(value);
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), x => x.toString(16).padStart(2, '0')).join('');
}
async function mappedUuid(userId, batchId, key) {
  const digest = await hash(`${userId}:${batchId}:${key}`);
  return `${digest.slice(0, 8)}-${digest.slice(8, 12)}-4${digest.slice(13, 16)}-8${digest.slice(17, 20)}-${digest.slice(20, 32)}`;
}
export function validateRestoreRequest(input) {
  if (!object(input) || !BACKUP_KINDS.includes(input.kind) || typeof input.batchId !== 'string' || !BATCH.test(input.batchId)) throw new InputError('恢复批次或类别无效。');
  if (input.schemaVersion !== 1 && input.schemaVersion !== 2) throw new InputError('不支持的备份版本。');
  const item = normalizeBackupItem(input.kind, input.item);
  if (new TextEncoder().encode(JSON.stringify(item)).length > MAX_ITEM_BYTES) throw new InputError('单条记录超过数据库容量限制；此备份无法完整恢复。', 413);
  return { kind: input.kind, batchId: input.batchId, item };
}

export async function backupManifest(db, userId) {
  const revision = (await db.prepare('SELECT revision FROM user_data_revisions WHERE user_id = ?').bind(userId).first())?.revision || 0;
  const counts = {};
  for (const kind of BACKUP_KINDS) {
    const table = { problems: 'personal_problems', drafts: 'drafts', submissions: 'submissions', progress: 'practice_progress', plans: 'daily_plans', settings: 'user_settings' }[kind];
    counts[kind] = (await db.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE user_id = ?`).bind(userId).first()).n;
  }
  const after = (await db.prepare('SELECT revision FROM user_data_revisions WHERE user_id = ?').bind(userId).first())?.revision || 0;
  if (after !== revision) throw new InputError('导出时数据发生变化，请重试。', 409);
  return { schemaVersion: 2, exportedAt: new Date().toISOString(), revision, counts };
}
export async function backupPage(db, userId, kind, offset, limit, revision) {
  if (!BACKUP_KINDS.includes(kind)) throw new InputError('备份类别无效。');
  int(offset, '分页位置', 0, 1000); int(limit, '分页大小', 1, kind === 'problems' ? 2 : 5);
  int(revision, '备份版本');
  const before = (await db.prepare('SELECT revision FROM user_data_revisions WHERE user_id = ?').bind(userId).first())?.revision || 0;
  if (before !== revision) throw new InputError('导出时数据发生变化，请重试。', 409);
  const queries = {
    problems: 'SELECT * FROM personal_problems WHERE user_id = ? ORDER BY id LIMIT ? OFFSET ?',
    drafts: 'SELECT problem_id, code, stdin, expected, version, updated_at FROM drafts WHERE user_id = ? ORDER BY problem_id LIMIT ? OFFSET ?',
    submissions: 'SELECT id, problem_id, status, code, stdout, stderr, created_at FROM submissions WHERE user_id = ? ORDER BY id LIMIT ? OFFSET ?',
    progress: 'SELECT problem_id, attempts, successes, last_status, last_practiced_at FROM practice_progress WHERE user_id = ? ORDER BY problem_id LIMIT ? OFFSET ?',
    plans: 'SELECT day, problem_id, completed FROM daily_plans WHERE user_id = ? ORDER BY day, problem_id LIMIT ? OFFSET ?',
    settings: 'SELECT settings_json FROM user_settings WHERE user_id = ? LIMIT ? OFFSET ?'
  };
  const rows = (await db.prepare(queries[kind]).bind(userId, limit, offset).all()).results;
  const after = (await db.prepare('SELECT revision FROM user_data_revisions WHERE user_id = ?').bind(userId).first())?.revision || 0;
  if (after !== revision) throw new InputError('导出时数据发生变化，请重试。', 409);
  const items = kind === 'problems' ? rows.map(problemFromRow) : kind === 'settings' ? rows.map(row => ({ settings: JSON.parse(row.settings_json) })) : rows;
  for (const item of items) {
    const normalized = normalizeBackupItem(kind, item);
    if (new TextEncoder().encode(JSON.stringify(normalized)).length > MAX_ITEM_BYTES) throw new InputError('单条记录超过可恢复容量，无法生成完整备份。请缩短该条内容后重试。', 413);
  }
  return { kind, offset, items };
}

async function planRestore(db, userId, data) {
  const { kind, batchId, item } = data;
  const key = sourceKey(kind, item);
  const fingerprint = await hash(JSON.stringify(item));
  const prior = await db.prepare('SELECT input_hash, outcome, target_id FROM restore_entries WHERE user_id = ? AND batch_id = ? AND kind = ? AND source_key = ?').bind(userId, batchId, kind, key).first();
  if (prior) {
    if (prior.input_hash !== fingerprint) throw new InputError('同一恢复批次中的条目内容已改变。', 409);
    return { key, fingerprint, outcome: prior.outcome, targetId: prior.target_id, replayed: true };
  }
  const restoreCount = await db.prepare('SELECT COUNT(*) AS n FROM restore_entries WHERE user_id = ?').bind(userId).first();
  if (restoreCount.n >= 10000) throw new InputError('已达到恢复记录上限，请联系管理员处理旧批次后再恢复。', 429);
  let targetId = '';
  let outcome = 'created';
  if (kind === 'problems') {
    const existing = item.sourceUrl
      ? await db.prepare('SELECT * FROM personal_problems WHERE user_id = ? AND source_url = ?').bind(userId, item.sourceUrl).first()
      : await db.prepare('SELECT * FROM personal_problems WHERE user_id = ? AND source_url = ? AND title = ? AND statement = ?').bind(userId, '', item.title, item.statement).first();
    if (existing) {
      const normalizedExisting = normalizeProblem(problemFromRow(existing));
      outcome = JSON.stringify(normalizedExisting) === JSON.stringify(normalizeProblem(item)) ? 'merged' : 'conflict';
      if (outcome === 'merged') targetId = existing.id;
    } else {
      const count = await db.prepare('SELECT COUNT(*) AS n FROM personal_problems WHERE user_id = ?').bind(userId).first();
      if (count.n >= MAX.problems) outcome = 'quota';
      else targetId = await mappedUuid(userId, batchId, key);
    }
  } else if (kind !== 'settings') {
    const sourceProblem = item.problemId;
    if (sourceProblem === 'sum' || sourceProblem === 'free') targetId = sourceProblem;
    else {
      const mapping = await db.prepare('SELECT target_id, outcome FROM restore_entries WHERE user_id = ? AND batch_id = ? AND kind = ? AND source_key = ?').bind(userId, batchId, 'problems', sourceProblem).first();
      if (!mapping) outcome = 'unmapped';
      else if (!mapping.target_id || mapping.outcome === 'conflict') outcome = 'conflict';
      else targetId = mapping.target_id;
    }
    if (outcome === 'created') {
      const table = { drafts: 'drafts', submissions: 'submissions', progress: 'practice_progress', plans: 'daily_plans' }[kind];
      const exists = kind === 'submissions' ? await db.prepare('SELECT id FROM submissions WHERE user_id = ? AND id = ?').bind(userId, await mappedUuid(userId, batchId, key)).first()
        : kind === 'plans' ? await db.prepare('SELECT problem_id FROM daily_plans WHERE user_id = ? AND day = ? AND problem_id = ?').bind(userId, item.day, targetId).first()
        : await db.prepare(`SELECT problem_id FROM ${table} WHERE user_id = ? AND problem_id = ?`).bind(userId, targetId).first();
      if (exists) outcome = 'existing';
      else {
        const count = await db.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE user_id = ?`).bind(userId).first();
        if (count.n >= MAX[kind]) outcome = 'quota';
        if (kind === 'plans' && outcome === 'created') {
          const dayCount = await db.prepare('SELECT COUNT(*) AS n FROM daily_plans WHERE user_id = ? AND day = ?').bind(userId, item.day).first();
          if (dayCount.n >= 5) outcome = 'quota';
        }
      }
    }
  } else {
    const exists = await db.prepare('SELECT user_id FROM user_settings WHERE user_id = ?').bind(userId).first();
    if (exists) outcome = 'existing';
  }
  return { key, fingerprint, outcome, targetId, replayed: false };
}
export async function restorePreview(db, userId, raw) {
  const data = validateRestoreRequest(raw);
  const plan = await planRestore(db, userId, data);
  const futureProblem = Array.isArray(raw.sourceProblemIds) && raw.sourceProblemIds.length <= 200 && raw.sourceProblemIds.includes(data.item.problemId);
  const outcome = plan.outcome === 'unmapped' && futureProblem ? 'pending' : plan.outcome;
  return { kind: data.kind, sourceKey: plan.key, outcome, targetId: plan.targetId, replayed: plan.replayed };
}
export async function restoreOne(db, userId, raw) {
  const data = validateRestoreRequest(raw);
  const plan = await planRestore(db, userId, data);
  if (plan.replayed) return { kind: data.kind, sourceKey: plan.key, outcome: plan.outcome, targetId: plan.targetId, replayed: true };
  const { kind, batchId, item } = data;
  const time = Math.floor(Date.now() / 1000);
  if (!['created', 'merged'].includes(plan.outcome)) return { kind, sourceKey: plan.key, outcome: plan.outcome, targetId: plan.targetId, replayed: false };
  const statements = [];
  if (plan.outcome === 'created') {
    if (kind === 'problems') statements.push(db.prepare('INSERT INTO personal_problems (id, user_id, title, statement, source_url, source_kind, tags_json, raw_samples_json, cases_json, favorite, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').bind(plan.targetId, userId, item.title, item.statement, item.sourceUrl, item.sourceKind, JSON.stringify(item.tags), JSON.stringify(item.rawSamples), JSON.stringify(item.cases), item.favorite ? 1 : 0, time, time));
    if (kind === 'drafts') statements.push(db.prepare('INSERT INTO drafts (user_id, problem_id, code, stdin, expected, version, updated_at) VALUES (?, ?, ?, ?, ?, 1, ?)').bind(userId, plan.targetId, item.code, item.stdin, item.expected, time));
    if (kind === 'submissions') statements.push(db.prepare('INSERT INTO submissions (id, user_id, problem_id, status, code, stdout, stderr, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').bind(await mappedUuid(userId, batchId, plan.key), userId, plan.targetId, item.status, item.code, item.stdout, item.stderr, item.createdAt));
    if (kind === 'progress') statements.push(db.prepare('INSERT INTO practice_progress (user_id, problem_id, attempts, successes, last_status, last_practiced_at) VALUES (?, ?, ?, ?, ?, ?)').bind(userId, plan.targetId, item.attempts, item.successes, item.lastStatus, item.lastPracticedAt));
    if (kind === 'plans') statements.push(db.prepare('INSERT INTO daily_plans (user_id, day, problem_id, completed) VALUES (?, ?, ?, ?)').bind(userId, item.day, plan.targetId, item.completed ? 1 : 0));
    if (kind === 'settings') statements.push(db.prepare('INSERT INTO user_settings (user_id, settings_json, updated_at) VALUES (?, ?, ?)').bind(userId, JSON.stringify(item.settings), time));
  }
  statements.push(db.prepare('INSERT INTO restore_entries (user_id, batch_id, kind, source_key, input_hash, outcome, target_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').bind(userId, batchId, kind, plan.key, plan.fingerprint, plan.outcome, plan.targetId, time));
  try {
    await db.batch(statements);
  } catch (error) {
    const committed = await db.prepare('SELECT input_hash, outcome, target_id FROM restore_entries WHERE user_id = ? AND batch_id = ? AND kind = ? AND source_key = ?').bind(userId, batchId, kind, plan.key).first();
    if (committed?.input_hash === plan.fingerprint) return { kind, sourceKey: plan.key, outcome: committed.outcome, targetId: committed.target_id, replayed: true };
    if (committed) throw new InputError('同一恢复批次中的条目内容已改变。', 409);
    throw new InputError('恢复时数据已发生变化，请重新预览并重试。', 409);
  }
  return { kind, sourceKey: plan.key, outcome: plan.outcome, targetId: plan.targetId, replayed: false };
}
