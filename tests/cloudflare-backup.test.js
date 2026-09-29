import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { onRequest } from '../cloudflare/functions/api/[[path]].js';

const origin = 'https://acmcoder.example';
const batchId = 'a'.repeat(64);
function fixture() {
  const sqlite = new DatabaseSync(':memory:');
  for (const file of ['0001_initial.sql', '0002_restore_entries.sql']) sqlite.exec(readFileSync(new URL(`../cloudflare/migrations/${file}`, import.meta.url), 'utf8'));
  const db = {
    prepare(sql) {
      return { bind(...params) {
        const statement = sqlite.prepare(sql);
        return { first: async () => statement.get(...params) || null, all: async () => ({ results: statement.all(...params) }), run: async () => ({ meta: { changes: statement.run(...params).changes } }) };
      } };
    },
    async batch(statements) {
      sqlite.exec('BEGIN');
      try { const results = []; for (const statement of statements) results.push(await statement.run()); sqlite.exec('COMMIT'); return results; }
      catch (error) { sqlite.exec('ROLLBACK'); throw error; }
    }
  };
  for (const user of ['a', 'b']) {
    sqlite.prepare('INSERT INTO users (id, github_id, login, created_at, updated_at) VALUES (?, ?, ?, 1, 1)').run(user, user, user);
    sqlite.prepare('INSERT INTO sessions (token_hash, user_id, expires_at, created_at) VALUES (?, ?, 9999999999, 1)').run(createHash('sha256').update(user.repeat(64)).digest('hex'), user);
  }
  async function call(user, path, method = 'GET', data, expectedUser = user) {
    const headers = { cookie: `__Host-acm_session=${user.repeat(64)}`, 'x-acm-expected-user': expectedUser };
    if (data !== undefined) headers['content-type'] = 'application/json';
    if (method !== 'GET') headers.origin = origin;
    const request = new Request(`${origin}/api/${path}`, { method, headers, body: data === undefined ? undefined : JSON.stringify(data) });
    const response = await onRequest({ request, env: { DB: db } });
    return { status: response.status, data: await response.json() };
  }
  const restore = (user, kind, item, method = 'restore', schemaVersion = 2) => call(user, method, 'POST', { schemaVersion, batchId, kind, item });
  return { sqlite, call, restore };
}

test('V2 pages restore six data types with remapped references and repeated import is idempotent', async () => {
  const { sqlite, call, restore } = fixture();
  const created = await call('a', 'problems', 'POST', { title: 'Archive', statement: 'Practice', sourceUrl: 'https://example.org/archive', rawSamples: ['raw'], cases: [{ stdin: '2\n', expected: '4\n' }] });
  assert.equal(created.status, 201);
  const oldId = created.data.problem.id;
  await call('a', `drafts/${oldId}`, 'PUT', { code: 'print(4)', stdin: '2\n', expected: '4\n', baseVersion: null });
  await call('a', 'submissions', 'POST', { problemId: oldId, status: 'self_pass', code: 'print(4)', stdout: '4\n', stderr: '' });
  sqlite.prepare('INSERT INTO daily_plans (user_id, day, problem_id, completed) VALUES (?, ?, ?, 1)').run('a', '2026-09-29', oldId);
  sqlite.prepare('INSERT INTO user_settings (user_id, settings_json, updated_at) VALUES (?, ?, 1)').run('a', '{"theme":"light"}');
  const manifest = (await call('a', 'backup/manifest')).data;
  assert.equal(manifest.schemaVersion, 2);
  const backup = {};
  for (const kind of ['problems', 'drafts', 'submissions', 'progress', 'plans', 'settings']) {
    const page = await call('a', `backup/${kind}?offset=0&limit=${kind === 'problems' ? 2 : 5}&revision=${manifest.revision}`);
    assert.equal(page.status, 200, kind);
    backup[kind] = page.data.items;
    assert.equal(backup[kind].length, manifest.counts[kind]);
  }
  assert.equal(backup.problems[0].cases[0].stdin, '2\n');
  const oldDraft = backup.drafts[0];
  assert.equal((await restore('b', 'drafts', oldDraft, 'restore/preview')).data.outcome, 'unmapped');
  for (const kind of ['problems', 'drafts', 'submissions', 'progress', 'plans', 'settings']) {
    for (const item of backup[kind]) assert.equal((await restore('b', kind, item)).data.outcome, 'created', kind);
  }
  const copied = (await call('b', 'problems')).data.problems[0];
  assert.notEqual(copied.id, oldId);
  assert.deepEqual(copied.cases, [{ stdin: '2\n', expected: '4\n' }]);
  assert.equal((await call('b', `drafts/${copied.id}`)).data.draft.code, 'print(4)');
  assert.equal((await call('b', 'submissions')).data.submissions[0].problemId, copied.id);
  assert.equal((await call('b', 'progress')).data.progress[0].attempts, 1);
  assert.equal(sqlite.prepare('SELECT problem_id FROM daily_plans WHERE user_id = ?').get('b').problem_id, copied.id);
  assert.equal(JSON.parse(sqlite.prepare('SELECT settings_json FROM user_settings WHERE user_id = ?').get('b').settings_json).theme, 'light');
  for (const kind of ['problems', 'drafts', 'submissions', 'progress', 'plans', 'settings']) {
    for (const item of backup[kind]) assert.equal((await restore('b', kind, item)).data.replayed, true, kind);
  }
  assert.equal((await call('b', 'progress')).data.progress[0].attempts, 1);
  assert.equal((await call('b', 'submissions')).data.submissions.length, 1);
});

test('schema 1, orphan records, conflicts, bad input and quota are explicit', async () => {
  const { sqlite, call, restore } = fixture();
  const created = await call('a', 'problems', 'POST', { title: 'Old', sourceUrl: 'https://example.org/old' });
  const oldId = created.data.problem.id;
  const legacy = (await call('a', 'export')).data;
  assert.equal(legacy.schemaVersion, 1);
  assert.equal((await restore('b', 'problems', legacy.problems[0], 'restore', 1)).data.outcome, 'created');
  const replay = await restore('b', 'problems', legacy.problems[0], 'restore', 1);
  assert.equal(replay.data.replayed, true);
  assert.equal((await restore('b', 'submissions', { id: 'orphan', problem_id: 'deleted', status: 'self_fail', code: '', stdout: '', stderr: '', created_at: 1 }, 'restore', 1)).data.outcome, 'unmapped');
  assert.equal((await restore('b', 'drafts', { problem_id: oldId, code: 'x', stdin: '', expected: '' }, 'restore', 1)).data.outcome, 'created');
  const conflict = await restore('b', 'problems', { ...legacy.problems[0], statement: 'Different' }, 'restore/preview', 1);
  assert.equal(conflict.status, 409); // same batch/source key cannot silently change content
  const wrongAccount = await call('b', 'problems', 'POST', { title: 'Wrong' }, 'a');
  assert.equal(wrongAccount.status, 409);
  assert.equal(wrongAccount.data.code, 'account_changed');
  assert.equal((await restore('b', 'problems', { title: 'No ID' })).status, 400);
  assert.equal((await call('b', 'restore', 'POST', { schemaVersion: 2, batchId, kind: 'plans', item: { day: 'bad', problemId: oldId } })).status, 400);
  const before = sqlite.prepare('SELECT revision FROM user_data_revisions WHERE user_id = ?').get('b').revision;
  await call('b', 'problems', 'POST', { title: 'Changes during backup' });
  assert.equal((await call('b', `backup/problems?offset=0&limit=2&revision=${before}`)).status, 409);
});

test('multibyte backup over 600 KiB restores, and oversized rows cannot be exported as complete backups', async () => {
  const { sqlite, call, restore } = fixture();
  const multibyte = '你'.repeat(16000);
  const rawSamples = Array(8).fill(multibyte);
  const cases = Array(8).fill(null).map(() => ({ stdin: multibyte, expected: multibyte }));
  sqlite.prepare('INSERT INTO personal_problems (id, user_id, title, statement, raw_samples_json, cases_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 1, 1)')
    .run('large', 'a', 'Large', '', JSON.stringify(rawSamples), JSON.stringify(cases));
  const manifest = (await call('a', 'backup/manifest')).data;
  const page = await call('a', `backup/problems?offset=0&limit=2&revision=${manifest.revision}`);
  assert.equal(page.status, 200);
  assert.ok(Buffer.byteLength(JSON.stringify(page.data.items[0])) > 600 * 1024);
  const copied = await restore('b', 'problems', page.data.items[0]);
  assert.equal(copied.data.outcome, 'created');
  assert.equal((await call('b', 'problems')).data.problems[0].rawSamples[0], multibyte);

  const controls = '\u0001'.repeat(16000);
  sqlite.prepare('UPDATE personal_problems SET statement = ?, raw_samples_json = ?, cases_json = ? WHERE id = ?')
    .run('\u0001'.repeat(5000), JSON.stringify(Array(7).fill(controls)), JSON.stringify(Array(6).fill(null).map(() => ({ stdin: controls, expected: controls }))), 'large');
  const changed = (await call('a', 'backup/manifest')).data;
  const refused = await call('a', `backup/problems?offset=0&limit=2&revision=${changed.revision}`);
  assert.equal(refused.status, 413);
  assert.match(refused.data.error, /无法生成完整备份/);
});

test('a conflict after preview creates neither business row nor success ledger', async () => {
  const { sqlite, restore } = fixture();
  const item = { id: 'source', title: 'Race', statement: '', sourceUrl: 'https://example.org/race' };
  const preview = await restore('a', 'problems', item, 'restore/preview');
  assert.equal(preview.data.outcome, 'created');
  sqlite.prepare('INSERT INTO personal_problems (id, user_id, title, statement, source_url, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 1, 1)').run('different', 'a', 'Race', '', item.sourceUrl);
  const response = await restore('a', 'problems', item);
  assert.equal(response.status, 200);
  assert.equal(response.data.outcome, 'conflict');
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM restore_entries WHERE user_id = ?').get('a').n, 0);
});
