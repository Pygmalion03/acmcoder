import { InputError, normalizeProblem, problemFromRow, validateSourceUrl } from '../../lib/problem.js';
import { backupManifest, backupPage, restoreOne, restorePreview } from '../../lib/backup.js';
import { catalogFor, normalizeCatalog, normalizePreferences, preferencesFor, readSettings, patchSetting, rankedRecommendations, recommendationId, validRecommendationId } from '../../lib/recommendations.js';

const SESSION_SECONDS = 14 * 24 * 3600;
const MAX_BODY = 80000;
const MAX_PROBLEMS = 200;
const beijingDay = (date = new Date()) => {
  const parts = new Intl.DateTimeFormat('en', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date);
  const value = type => parts.find(part => part.type === type).value;
  return `${value('year')}-${value('month')}-${value('day')}`;
};
const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' };

function json(value, status = 200, headers = {}) { return new Response(JSON.stringify(value), { status, headers: { ...JSON_HEADERS, ...headers } }); }
function redirect(url, cookies = []) {
  const headers = new Headers({ location: url, 'cache-control': 'no-store', 'referrer-policy': 'no-referrer' });
  for (const cookie of cookies) headers.append('set-cookie', cookie);
  return new Response(null, { status: 302, headers });
}
function randomHex() { return Array.from(crypto.getRandomValues(new Uint8Array(32)), byte => byte.toString(16).padStart(2, '0')).join(''); }
async function sha256(text) { return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))), byte => byte.toString(16).padStart(2, '0')).join(''); }
function cookie(request, name) { const match = request.headers.get('cookie')?.match(new RegExp(`(?:^|; )${name}=([^;]*)`)); return match ? decodeURIComponent(match[1]) : ''; }
function sessionCookie(value, maxAge = SESSION_SECONDS) { return `__Host-acm_session=${value}; Path=/; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Lax`; }
function stateCookie(value, maxAge = 600) { return `__Host-acm_oauth=${value}; Path=/; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Lax`; }
function now() { return Math.floor(Date.now() / 1000); }
function requireDb(env) { if (!env.DB) throw new InputError('数据库尚未配置。', 503); return env.DB; }
function assertOrigin(request) {
  if (request.headers.get('origin') !== new URL(request.url).origin) throw new InputError('请求来源不匹配。', 403);
}
async function body(request, maxBody = MAX_BODY) {
  if (Number(request.headers.get('content-length') || 0) > maxBody) throw new InputError('请求过大。', 413);
  if (!request.headers.get('content-type')?.startsWith('application/json')) throw new InputError('请求必须使用 JSON。', 415);
  const reader = request.body?.getReader();
  if (!reader) throw new InputError('请求内容为空。');
  let size = 0;
  const chunks = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > maxBody) { await reader.cancel(); throw new InputError('请求过大。', 413); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  try { return JSON.parse(new TextDecoder().decode(bytes)); } catch { throw new InputError('JSON 格式无效。'); }
}
async function currentUser(request, db) {
  const token = cookie(request, '__Host-acm_session');
  if (!/^[0-9a-f]{64}$/.test(token)) return null;
  const tokenHash = await sha256(token);
  return db.prepare('SELECT users.id, users.login, users.avatar_url FROM sessions JOIN users ON users.id = sessions.user_id WHERE sessions.token_hash = ? AND sessions.expires_at > ?').bind(tokenHash, now()).first();
}
async function requireUser(request, db) { const user = await currentUser(request, db); if (!user) throw new InputError('请先登录。', 401); return user; }
function validId(id) { if (!/^[a-zA-Z0-9_-]{1,80}$/.test(id)) throw new InputError('题目 ID 无效。'); return id; }
function publicOrigin(request, env) {
  const value = env.PUBLIC_ORIGIN;
  if (!value || new URL(request.url).origin !== value || !value.startsWith('https://')) throw new InputError('登录入口尚未为此域名配置。', 503);
  return value;
}

async function authStart(request, env) {
  const origin = publicOrigin(request, env);
  if (!env.GITHUB_CLIENT_ID || !env.GITHUB_CLIENT_SECRET) throw new InputError('GitHub 登录尚未配置。', 503);
  const state = randomHex();
  const target = new URL('https://github.com/login/oauth/authorize');
  target.searchParams.set('client_id', env.GITHUB_CLIENT_ID);
  target.searchParams.set('redirect_uri', `${origin}/api/auth/github/callback`);
  target.searchParams.set('state', state);
  return redirect(target.href, [stateCookie(state)]);
}
async function authCallback(request, env, db) {
  const origin = publicOrigin(request, env);
  const params = new URL(request.url).searchParams;
  const state = params.get('state');
  const expected = cookie(request, '__Host-acm_oauth');
  if (!state || !expected || state !== expected || !/^[0-9a-f]{64}$/.test(state)) throw new InputError('登录状态失效，请重新登录。', 403);
  const code = params.get('code');
  if (!code || code.length > 256) throw new InputError('GitHub 未返回授权码。', 400);
  const exchange = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST', headers: { accept: 'application/json', 'content-type': 'application/json' },
    body: JSON.stringify({ client_id: env.GITHUB_CLIENT_ID, client_secret: env.GITHUB_CLIENT_SECRET, code, redirect_uri: `${origin}/api/auth/github/callback` })
  });
  if (!exchange.ok) throw new InputError('GitHub 登录暂不可用。', 502);
  const tokenInfo = await exchange.json();
  if (!tokenInfo.access_token) throw new InputError('GitHub 授权失败，请重试。', 502);
  const identity = await fetch('https://api.github.com/user', { headers: { accept: 'application/vnd.github+json', authorization: `Bearer ${tokenInfo.access_token}`, 'user-agent': 'ACMCoder-Free' } });
  if (!identity.ok) throw new InputError('GitHub 用户信息获取失败。', 502);
  const github = await identity.json();
  if (!Number.isSafeInteger(github.id) || typeof github.login !== 'string') throw new InputError('GitHub 用户信息无效。', 502);
  const time = now();
  const githubId = String(github.id);
  const invitedIds = new Set(String(env.INVITED_GITHUB_IDS || '').split(',').map(x => x.trim()).filter(Boolean));
  if (!invitedIds.has(githubId)) throw new InputError('当前仅受邀用户可登录。', 403);
  const prior = await db.prepare('SELECT id FROM users WHERE github_id = ?').bind(githubId).first();
  await db.prepare('INSERT INTO users (id, github_id, login, avatar_url, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(github_id) DO UPDATE SET login = excluded.login, avatar_url = excluded.avatar_url, updated_at = excluded.updated_at').bind(prior?.id || crypto.randomUUID(), githubId, github.login.slice(0, 100), String(github.avatar_url || '').slice(0, 500), time, time).run();
  const actualUser = await db.prepare('SELECT id FROM users WHERE github_id = ?').bind(githubId).first();
  const userId = actualUser.id;
  const token = randomHex();
  await db.batch([
    db.prepare('DELETE FROM sessions WHERE user_id = ? AND (expires_at <= ? OR token_hash NOT IN (SELECT token_hash FROM sessions WHERE user_id = ? AND expires_at > ? ORDER BY created_at DESC LIMIT 4))').bind(userId, time, userId, time),
    db.prepare('INSERT INTO sessions (token_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)').bind(await sha256(token), userId, time + SESSION_SECONDS, time)
  ]);
  return redirect(`${origin}/#practice`, [stateCookie('', 0), sessionCookie(token)]);
}
async function logout(request, db) {
  assertOrigin(request);
  const token = cookie(request, '__Host-acm_session');
  if (/^[0-9a-f]{64}$/.test(token)) await db.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(await sha256(token)).run();
  return json({ ok: true }, 200, { 'set-cookie': sessionCookie('', 0) });
}

async function listProblems(db, userId, url) {
  const q = (url.searchParams.get('q') || '').trim().slice(0, 80);
  const favorite = url.searchParams.get('favorite') === '1';
  const pattern = `%${q.replace(/[\\%_]/g, '\\$&')}%`;
  const statement = 'SELECT * FROM personal_problems WHERE user_id = ? AND (? = 0 OR favorite = 1) AND (title LIKE ? ESCAPE \'\\\' OR tags_json LIKE ? ESCAPE \'\\\') ORDER BY updated_at DESC LIMIT 201';
  const rows = await db.prepare(statement).bind(userId, favorite ? 1 : 0, pattern, pattern).all();
  return json({ problems: rows.results.slice(0, MAX_PROBLEMS).map(problemFromRow), capped: rows.results.length > MAX_PROBLEMS });
}
async function addProblem(request, db, userId, supplied) {
  const data = normalizeProblem(supplied ?? await body(request));
  const count = await db.prepare('SELECT COUNT(*) AS n FROM personal_problems WHERE user_id = ?').bind(userId).first();
  if (count.n >= MAX_PROBLEMS) throw new InputError('个人题库已达 200 题上限，请先导出并删除旧题。', 429);
  if (data.sourceUrl) {
    const duplicate = await db.prepare('SELECT id, title FROM personal_problems WHERE user_id = ? AND source_url = ?').bind(userId, data.sourceUrl).first();
    if (duplicate) return json({ error: 'duplicate', existing: duplicate }, 409);
  } else {
    const duplicate = await db.prepare('SELECT id, title FROM personal_problems WHERE user_id = ? AND source_url = ? AND title = ? AND statement = ?').bind(userId, '', data.title, data.statement).first();
    if (duplicate) return json({ error: 'duplicate', existing: duplicate }, 409);
  }
  const id = crypto.randomUUID();
  const time = now();
  await db.prepare('INSERT INTO personal_problems (id, user_id, title, statement, source_url, source_kind, tags_json, raw_samples_json, cases_json, favorite, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').bind(id, userId, data.title, data.statement, data.sourceUrl, data.sourceKind, JSON.stringify(data.tags), JSON.stringify(data.rawSamples), JSON.stringify(data.cases), data.favorite ? 1 : 0, time, time).run();
  return json({ problem: { id, ...data, createdAt: time, updatedAt: time } }, 201);
}

async function oneProblem(db, userId, id) {
  const row = await db.prepare('SELECT * FROM personal_problems WHERE user_id = ? AND id = ?').bind(userId, validId(id)).first();
  if (!row) throw new InputError('题目不存在。', 404);
  return row;
}
async function requirePracticeProblem(db, userId, id) {
  validId(id);
  if (id === 'sum' || id === 'free') return;
  const owned = await db.prepare('SELECT id FROM personal_problems WHERE user_id = ? AND id = ?').bind(userId, id).first();
  if (!owned) throw new InputError('题目不存在或不属于当前用户。', 404);
}
async function updateProblem(request, db, userId, id) {
  const previous = await oneProblem(db, userId, id);
  const payload = await body(request);
  const data = normalizeProblem({ ...problemFromRow(previous), ...payload });
  if (data.sourceUrl && data.sourceUrl !== previous.source_url) {
    const duplicate = await db.prepare('SELECT id FROM personal_problems WHERE user_id = ? AND source_url = ?').bind(userId, data.sourceUrl).first();
    if (duplicate) return json({ error: 'duplicate', existing: duplicate }, 409);
  }
  const time = now();
  await db.prepare('UPDATE personal_problems SET title = ?, statement = ?, source_url = ?, source_kind = ?, tags_json = ?, raw_samples_json = ?, cases_json = ?, favorite = ?, updated_at = ? WHERE user_id = ? AND id = ?').bind(data.title, data.statement, data.sourceUrl, data.sourceKind, JSON.stringify(data.tags), JSON.stringify(data.rawSamples), JSON.stringify(data.cases), data.favorite ? 1 : 0, time, userId, id).run();
  return json({ problem: { id, ...data, createdAt: previous.created_at, updatedAt: time } });
}
async function deleteProblem(db, userId, id) {
  await oneProblem(db, userId, id);
  await db.batch([
    db.prepare('DELETE FROM personal_problems WHERE user_id = ? AND id = ?').bind(userId, id),
    db.prepare('DELETE FROM drafts WHERE user_id = ? AND problem_id = ?').bind(userId, id),
    db.prepare('DELETE FROM practice_progress WHERE user_id = ? AND problem_id = ?').bind(userId, id),
    db.prepare('DELETE FROM daily_plans WHERE user_id = ? AND problem_id = ?').bind(userId, id)
  ]);
  return json({ ok: true });
}
async function getDraft(db, userId, problemId) {
  await requirePracticeProblem(db, userId, problemId);
  const row = await db.prepare('SELECT code, stdin, expected, version, updated_at FROM drafts WHERE user_id = ? AND problem_id = ?').bind(userId, validId(problemId)).first();
  return json({ draft: row ? { code: row.code, stdin: row.stdin, expected: row.expected, version: row.version, updatedAt: row.updated_at } : null });
}
async function putDraft(request, db, userId, problemId) {
  await requirePracticeProblem(db, userId, problemId);
  const data = await body(request);
  if (typeof data.code !== 'string' || data.code.length > 50000 || typeof data.stdin !== 'string' || data.stdin.length > 16000 || typeof data.expected !== 'string' || data.expected.length > 16000) throw new InputError('草稿内容无效或超长。');
  const baseVersion = data.baseVersion;
  if (!Object.hasOwn(data, 'baseVersion')) throw new InputError('草稿缺少版本号。');
  if (baseVersion !== null && (!Number.isSafeInteger(baseVersion) || baseVersion < 1)) throw new InputError('草稿版本无效。');
  const time = now();
  let result;
  if (baseVersion === null) {
    const count = await db.prepare('SELECT COUNT(*) AS n FROM drafts WHERE user_id = ?').bind(userId).first();
    if (count.n >= MAX_PROBLEMS + 2) throw new InputError('草稿数量已达上限。', 429);
    result = await db.prepare('INSERT INTO drafts (user_id, problem_id, code, stdin, expected, version, updated_at) VALUES (?, ?, ?, ?, ?, 1, ?) ON CONFLICT(user_id, problem_id) DO NOTHING').bind(userId, problemId, data.code, data.stdin, data.expected, time).run();
  } else {
    result = await db.prepare('UPDATE drafts SET code = ?, stdin = ?, expected = ?, version = version + 1, updated_at = ? WHERE user_id = ? AND problem_id = ? AND version = ?').bind(data.code, data.stdin, data.expected, time, userId, problemId, baseVersion).run();
  }
  if (!result.meta.changes) {
    const current = await db.prepare('SELECT code, stdin, expected, version, updated_at FROM drafts WHERE user_id = ? AND problem_id = ?').bind(userId, problemId).first();
    return json({ error: 'conflict', current: current ? { code: current.code, stdin: current.stdin, expected: current.expected, version: current.version, updatedAt: current.updated_at } : null }, 409);
  }
  return json({ version: baseVersion === null ? 1 : baseVersion + 1, updatedAt: time });
}
async function addSubmission(request, db, userId) {
  const data = await body(request);
  await requirePracticeProblem(db, userId, data.problemId);
  if (!['self_pass', 'self_fail', 'error', 'stopped'].includes(data.status) || typeof data.code !== 'string' || data.code.length > 50000 || typeof data.stdout !== 'string' || data.stdout.length > 32768 || typeof data.stderr !== 'string' || data.stderr.length > 32768) throw new InputError('自测记录无效或超长。');
  const time = now();
  const todayCount = await db.prepare('SELECT COUNT(*) AS n FROM submissions WHERE user_id = ? AND created_at >= ?').bind(userId, time - 86400).first();
  if (todayCount.n >= 100) throw new InputError('今日自测记录已达 100 次上限；本机运行仍可继续。', 429);
  const id = crypto.randomUUID();
  await db.batch([
    db.prepare('INSERT INTO submissions (id, user_id, problem_id, status, code, stdout, stderr, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').bind(id, userId, data.problemId, data.status, data.code, data.stdout, data.stderr, time),
    db.prepare('INSERT INTO practice_progress (user_id, problem_id, attempts, successes, last_status, last_practiced_at) VALUES (?, ?, 1, ?, ?, ?) ON CONFLICT(user_id, problem_id) DO UPDATE SET attempts = attempts + 1, successes = successes + excluded.successes, last_status = excluded.last_status, last_practiced_at = excluded.last_practiced_at').bind(userId, data.problemId, data.status === 'self_pass' ? 1 : 0, data.status, time),
    db.prepare('DELETE FROM submissions WHERE user_id = ? AND id NOT IN (SELECT id FROM submissions WHERE user_id = ? ORDER BY created_at DESC LIMIT 100)').bind(userId, userId)
  ]);
  return json({ id, status: data.status, createdAt: time }, 201);
}
async function listSubmissions(db, userId) {
  const rows = await db.prepare('SELECT id, problem_id, status, code, stdout, stderr, created_at FROM submissions WHERE user_id = ? ORDER BY created_at DESC LIMIT 100').bind(userId).all();
  return json({ submissions: rows.results.map(row => ({ id: row.id, problemId: row.problem_id, status: row.status, code: row.code, stdout: row.stdout, stderr: row.stderr, createdAt: row.created_at })) });
}
async function getProgress(db, userId) {
  const rows = await db.prepare('SELECT problem_id, attempts, successes, last_status, last_practiced_at FROM practice_progress WHERE user_id = ? ORDER BY last_practiced_at DESC LIMIT 200').bind(userId).all();
  return json({ progress: rows.results.map(row => ({ problemId: row.problem_id, attempts: row.attempts, successes: row.successes, lastStatus: row.last_status, lastPracticedAt: row.last_practiced_at })) });
}
async function getPlan(db, userId, day) {
  const rows = await db.prepare('SELECT problem_id, completed FROM daily_plans WHERE user_id = ? AND day = ?').bind(userId, day).all();
  return json({ day, plan: rows.results.map(row => ({ problemId: row.problem_id, completed: !!row.completed })) });
}
async function planRecommendations(db, userId, today) {
  const rows = await db.prepare('SELECT problem_id FROM daily_plans WHERE user_id = ? AND day < ? AND completed = 0 ORDER BY day DESC LIMIT 50').bind(userId, today).all();
  return json({ problemIds: [...new Set(rows.results.map(row => row.problem_id))] });
}
async function putPlan(request, db, userId, day) {
  const data = await body(request);
  if (!Array.isArray(data.plan) || data.plan.length > 5 || data.plan.some(x => !x || typeof x.problemId !== 'string' || !/^[a-zA-Z0-9_-]{1,80}$/.test(x.problemId) || typeof x.completed !== 'boolean')) throw new InputError('今日计划格式无效。');
  const ids = data.plan.map(x => x.problemId);
  if (new Set(ids).size !== ids.length) throw new InputError('今日计划存在重复题目。');
  for (const id of ids) {
    if (id.startsWith('rec_')) {
      if (!await validRecommendationId(db, userId, id)) throw new InputError('计划中的推荐题不存在。');
    } else await requirePracticeProblem(db, userId, id);
  }
  const cutoff = beijingDay(new Date(Date.now() - 30 * 86400000));
  const statements = [db.prepare('DELETE FROM daily_plans WHERE user_id = ? AND day < ?').bind(userId, cutoff), db.prepare('DELETE FROM daily_plans WHERE user_id = ? AND day = ?').bind(userId, day), ...data.plan.map(item => db.prepare('INSERT INTO daily_plans (user_id, day, problem_id, completed) VALUES (?, ?, ?, ?)').bind(userId, day, item.problemId, item.completed ? 1 : 0))];
  await db.batch(statements);
  return json({ day, plan: data.plan });
}
async function exportData(db, userId) {
  const [problems, drafts, submissions, progress, plans, settings] = await Promise.all([
    db.prepare('SELECT * FROM personal_problems WHERE user_id = ? LIMIT 201').bind(userId).all(),
    db.prepare('SELECT * FROM drafts WHERE user_id = ? LIMIT 202').bind(userId).all(),
    db.prepare('SELECT * FROM submissions WHERE user_id = ? LIMIT 101').bind(userId).all(),
    db.prepare('SELECT * FROM practice_progress WHERE user_id = ? LIMIT 201').bind(userId).all(),
    db.prepare('SELECT * FROM daily_plans WHERE user_id = ? ORDER BY day DESC LIMIT 155').bind(userId).all(),
    db.prepare('SELECT settings_json FROM user_settings WHERE user_id = ?').bind(userId).first()
  ]);
  return json({ schemaVersion: 1, exportedAt: new Date().toISOString(), problems: problems.results.map(problemFromRow), drafts: drafts.results, submissions: submissions.results, progress: progress.results, plans: plans.results, settings: settings ? JSON.parse(settings.settings_json) : {} }, 200, { 'content-disposition': 'attachment; filename="acmcoder-export.json"' });
}
async function deleteAccount(request, db, userId) {
  const data = await body(request);
  if (data.confirm !== 'DELETE_MY_ACCOUNT') throw new InputError('请明确确认删除账户数据。');
  await db.batch([
    db.prepare('DELETE FROM users WHERE id = ?').bind(userId),
    db.prepare('DELETE FROM user_data_revisions WHERE user_id = ?').bind(userId)
  ]);
  return json({ ok: true }, 200, { 'set-cookie': sessionCookie('', 0) });
}
async function fetchText(request) {
  const data = await body(request);
  const sourceUrl = validateSourceUrl(data.url);
  const url = new URL(sourceUrl);
  const leetCodeMatch = /^\/problems\/([a-z0-9]+(?:-[a-z0-9]+)*)\/?$/.exec(url.pathname);
  if (['leetcode.cn', 'leetcode.com'].includes(url.hostname) && leetCodeMatch && !url.search) {
    const question = await fetchLeetCodePublic(leetCodeMatch[1]);
    if (!question?.statement) throw new InputError('力扣公开题面暂不可用；可收藏原题链接并手动粘贴题面。', 502);
    return json({ sourceUrl, statement: question.statement, title: question.title, sourceKind: 'fetched' });
  }
  if (url.hostname !== 'raw.githubusercontent.com' || !/^\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/.+\.(md|txt)$/i.test(url.pathname)) throw new InputError('只支持力扣题目链接或 GitHub 公共仓库原始 Markdown/TXT；其他链接可收藏后手动粘贴题面。');
  const response = await fetch(url.href, { redirect: 'error', signal: AbortSignal.timeout(5000), headers: { accept: 'text/plain, text/markdown' } });
  if (!response.ok) throw new InputError('来源读取失败，请改用手动题面。', 502);
  if (Number(response.headers.get('content-length') || 0) > 30000) throw new InputError('来源文本过长。', 413);
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > 30000) { await reader.cancel(); throw new InputError('来源文本过长。', 413); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  const statement = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  return json({ sourceUrl, statement, title: url.pathname.split('/').pop().replace(/\.(md|txt)$/i, '').replace(/[-_]/g, ' '), sourceKind: 'fetched' });
}

async function recommendationCatalog(db, userId) {
  const settings = await readSettings(db, userId);
  return json({ entries: catalogFor(settings), builtIn: !settings.recommendationCatalog });
}
async function replaceRecommendationCatalog(request, db, userId) {
  const entries = normalizeCatalog(await body(request, 300000));
  const settings = await readSettings(db, userId);
  await patchSetting(db, userId, '$.recommendationCatalog', { entries }, now());
  return json({ entries, builtIn: false });
}
async function plannerPreferences(request, db, userId) {
  const settings = await readSettings(db, userId);
  if (request.method === 'GET') return json({ preferences: preferencesFor(settings) });
  const planner = normalizePreferences(await body(request));
  await patchSetting(db, userId, '$.planner', planner, now());
  return json({ preferences: planner });
}
async function plannerAction(request, db, userId, slug) {
  const settings = await readSettings(db, userId);
  if (!catalogFor(settings).some(entry => entry.leetcodeSlug === slug)) throw new InputError('推荐题不存在。', 404);
  const { action } = await body(request);
  if (!['skip', 'mastered', 'want_practice_again'].includes(action)) throw new InputError('推荐题操作无效。');
  const item = { ...(settings.recommendationItems?.[slug] || {}) };
  if (action === 'skip') item.skippedAt = new Date().toISOString();
  if (action === 'mastered') { item.masteredAt = new Date().toISOString(); item.wantPracticeAgain = false; }
  if (action === 'want_practice_again') { item.masteredAt = ''; item.wantPracticeAgain = true; }
  await patchSetting(db, userId, `$.recommendationItems."${slug}"`, item, now());
  return json({ item });
}
async function generateRecommendationPlan(db, userId, day) {
  const settings = await readSettings(db, userId);
  const ranked = await rankedRecommendations(db, userId, settings, day);
  const count = preferencesFor(settings).dailyCount;
  if (!ranked.length) throw new InputError('推荐题库没有可用题目，请调整偏好或重新导入。');
  const plan = ranked.slice(0, count).map(entry => ({ problemId: recommendationId(entry.leetcodeSlug), completed: false }));
  const cutoff = beijingDay(new Date(Date.now() - 30 * 86400000));
  await db.batch([
    db.prepare('DELETE FROM daily_plans WHERE user_id = ? AND day < ?').bind(userId, cutoff),
    db.prepare('DELETE FROM daily_plans WHERE user_id = ? AND day = ?').bind(userId, day),
    ...plan.map(item => db.prepare('INSERT INTO daily_plans (user_id, day, problem_id, completed) VALUES (?, ?, ?, 0)').bind(userId, day, item.problemId))
  ]);
  return json({ day, plan });
}

function leetCodeText(html) {
  const plain = String(html || '').replace(/<\s*(script|style)\b[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, '')
    .replace(/<\s*br\s*\/?\s*>/gi, '\n').replace(/<\s*\/\s*(p|div|pre|li|ul|ol|h[1-6])\s*>/gi, '\n\n')
    .replace(/<[^>]+>/g, '').replace(/&nbsp;/gi, ' ').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'").replace(/&amp;/gi, '&').replace(/\n{3,}/g, '\n\n').trim();
  return plain.slice(0, 30000);
}
async function fetchLeetCodePublic(slug) {
  try {
    const query = 'query questionData($titleSlug: String!) { question(titleSlug: $titleSlug) { title translatedTitle content translatedContent } }';
    const response = await fetch('https://leetcode.cn/graphql/', {
      method: 'POST', redirect: 'error', signal: AbortSignal.timeout(5000),
      headers: { 'content-type': 'application/json', referer: `https://leetcode.cn/problems/${slug}/` },
      body: JSON.stringify({ operationName: 'questionData', variables: { titleSlug: slug }, query })
    });
    if (!response.ok || Number(response.headers.get('content-length') || 0) > 120000) return null;
    const reader = response.body.getReader();
    let size = 0; const chunks = [];
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 120000) { await reader.cancel(); return null; }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    const result = JSON.parse(new TextDecoder().decode(bytes));
    const question = result?.data?.question;
    const statement = leetCodeText(question?.translatedContent || question?.content);
    return statement ? { title: String(question.translatedTitle || question.title || slug).slice(0, 160), statement } : null;
  } catch { return null; }
}
async function addRecommendation(request, db, userId, slug) {
  const settings = await readSettings(db, userId);
  const entry = catalogFor(settings).find(item => item.leetcodeSlug === slug);
  if (!entry) throw new InputError('推荐题不存在。', 404);
  const duplicate = await db.prepare('SELECT id, title FROM personal_problems WHERE user_id = ? AND source_url = ?').bind(userId, entry.leetcodeUrl).first();
  if (duplicate) return json({ problem: duplicate, existing: true });
  const question = await fetchLeetCodePublic(slug);
  const statement = question?.statement || '';
  const result = await addProblem(request, db, userId, {
    title: entry.title, statement, sourceUrl: entry.leetcodeUrl,
    sourceKind: statement ? 'fetched' : 'link', tags: entry.tags,
    rawSamples: [], cases: []
  });
  return result;
}

async function route({ request, env }) {
    const db = requireDb(env);
    const url = new URL(request.url);
    const path = url.pathname.replace(/^\/api\//, '').split('/').filter(Boolean);
    const method = request.method;
    if (method === 'GET' && path.join('/') === 'auth/github/start') return authStart(request, env);
    if (method === 'GET' && path.join('/') === 'auth/github/callback') return authCallback(request, env, db);
    if (method === 'GET' && path.join('/') === 'auth/session') {
      const user = await currentUser(request, db);
      return json({ authenticated: !!user, user: user ? { id: user.id, login: user.login, avatarUrl: user.avatar_url } : null });
    }
    if (method === 'POST' && path.join('/') === 'auth/logout') return logout(request, db);
    const user = await requireUser(request, db);
    const expectedUser = request.headers.get('x-acm-expected-user');
    if (expectedUser && expectedUser !== user.id) return json({ error: '账号已在其他标签页切换；当前草稿仍保留在本机。', code: 'account_changed' }, 409);
    if (!['GET', 'HEAD'].includes(method)) assertOrigin(request);
    if (path.join('/') === 'backup/manifest' && method === 'GET') return json(await backupManifest(db, user.id));
    if (path[0] === 'backup' && path.length === 2 && method === 'GET') {
      const offset = Number(url.searchParams.get('offset') || 0);
      const limit = Number(url.searchParams.get('limit') || (path[1] === 'problems' ? 2 : 5));
      const revision = Number(url.searchParams.get('revision'));
      return json(await backupPage(db, user.id, path[1], offset, limit, revision));
    }
    if (path.join('/') === 'restore/preview' && method === 'POST') return json(await restorePreview(db, user.id, await body(request, 2500 * 1024)));
    if (path.join('/') === 'restore' && method === 'POST') return json(await restoreOne(db, user.id, await body(request, 2500 * 1024)));
    if (path[0] === 'problems' && path.length === 1) {
      if (method === 'GET') return listProblems(db, user.id, url);
      if (method === 'POST') return addProblem(request, db, user.id);
    }
    if (path[0] === 'problems' && path.length === 2) {
      if (method === 'GET') return json({ problem: problemFromRow(await oneProblem(db, user.id, path[1])) });
      if (method === 'PATCH') return updateProblem(request, db, user.id, path[1]);
      if (method === 'DELETE') return deleteProblem(db, user.id, path[1]);
    }
    if (path[0] === 'drafts' && path.length === 2) {
      if (method === 'GET') return getDraft(db, user.id, path[1]);
      if (method === 'PUT') return putDraft(request, db, user.id, path[1]);
    }
    if (path.join('/') === 'submissions') {
      if (method === 'GET') return listSubmissions(db, user.id);
      if (method === 'POST') return addSubmission(request, db, user.id);
    }
    if (path.join('/') === 'progress' && method === 'GET') return getProgress(db, user.id);
    if (path.join('/') === 'recommendations/catalog') {
      if (method === 'GET') return recommendationCatalog(db, user.id);
      if (method === 'PUT') return replaceRecommendationCatalog(request, db, user.id);
    }
    if (path.join('/') === 'recommendations/preferences' && ['GET', 'PUT'].includes(method)) return plannerPreferences(request, db, user.id);
    if (path.join('/') === 'recommendations/ranked' && method === 'GET') return json({ entries: await rankedRecommendations(db, user.id, await readSettings(db, user.id), beijingDay()) });
    if (path[0] === 'recommendations' && path.length === 3 && path[2] === 'action' && method === 'POST') return plannerAction(request, db, user.id, path[1]);
    if (path[0] === 'recommendations' && path.length === 3 && path[2] === 'add' && method === 'POST') return addRecommendation(request, db, user.id, path[1]);
    if (path.join('/') === 'recommendations/generate' && method === 'POST') return generateRecommendationPlan(db, user.id, beijingDay());
    if (path.join('/') === 'plans/today') {
      const day = beijingDay();
      if (method === 'GET') return getPlan(db, user.id, day);
      if (method === 'PUT') return putPlan(request, db, user.id, day);
    }
    if (path.join('/') === 'plans/recommendations' && method === 'GET') return planRecommendations(db, user.id, beijingDay());
    if (path.join('/') === 'export' && method === 'GET') return exportData(db, user.id);
    if (path.join('/') === 'account' && method === 'DELETE') return deleteAccount(request, db, user.id);
    if (path.join('/') === 'import/validate' && method === 'POST') {
      const item = normalizeProblem(await body(request));
      return json({ valid: true, title: item.title, cases: item.cases.length });
    }
    if (path.join('/') === 'import/fetch' && method === 'POST') return fetchText(request);
    return json({ error: '接口不存在。' }, 404);
}

export async function onRequest(context) {
  try {
    return await route(context);
  } catch (error) {
    if (error instanceof InputError) return json({ error: error.message }, error.status);
    if (/exceeded D1|free tier daily|database is full/i.test(String(error))) return json({ error: '免费数据库额度暂时用尽，请稍后再试；本机 Python 练习不受影响。' }, 503);
    return json({ error: '服务暂时不可用，请稍后重试。' }, 500);
  }
}
