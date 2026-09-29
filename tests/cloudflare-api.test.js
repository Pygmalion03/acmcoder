import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { onRequest } from '../cloudflare/functions/api/[[path]].js';

const origin = 'https://acmcoder.example';

function fixture() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(readFileSync(new URL('../cloudflare/migrations/0001_initial.sql', import.meta.url), 'utf8'));
  const db = {
    prepare(sql) {
      return {
        bind(...params) {
          const statement = sqlite.prepare(sql);
          return {
            first: async () => statement.get(...params) || null,
            all: async () => ({ results: statement.all(...params) }),
            run: async () => ({ meta: { changes: statement.run(...params).changes } })
          };
        }
      };
    },
    async batch(statements) { return Promise.all(statements.map(statement => statement.run())); }
  };
  for (const [id, token] of [['a', 'a'.repeat(64)], ['b', 'b'.repeat(64)]]) {
    sqlite.prepare('INSERT INTO users (id, github_id, login, created_at, updated_at) VALUES (?, ?, ?, 1, 1)').run(id, id, id);
    sqlite.prepare('INSERT INTO sessions (token_hash, user_id, expires_at, created_at) VALUES (?, ?, 9999999999, 1)').run(createHash('sha256').update(token).digest('hex'), id);
  }
  async function call(user, path, method = 'GET', data, requestOrigin = origin) {
    const headers = { cookie: `__Host-acm_session=${user.repeat(64)}` };
    if (data !== undefined) headers['content-type'] = 'application/json';
    if (method !== 'GET') headers.origin = requestOrigin;
    const request = new Request(`${origin}/api/${path}`, { method, headers, body: data === undefined ? undefined : JSON.stringify(data) });
    const response = await onRequest({ request, env: { DB: db } });
    return { status: response.status, data: await response.json() };
  }
  return { call, sqlite };
}

test('private problems, drafts, export and plans stay with their owner', async () => {
  const { call } = fixture();
  const created = await call('a', 'problems', 'POST', { title: 'Private', statement: 'Text', cases: [{ stdin: '1\n', expected: '1\n' }] });
  assert.equal(created.status, 201);
  const id = created.data.problem.id;
  assert.equal((await call('b', `problems/${id}`)).status, 404);
  assert.equal((await call('b', `problems/${id}`, 'PATCH', { title: 'Changed' })).status, 404);
  assert.equal((await call('b', `problems/${id}`, 'DELETE')).status, 404);
  assert.equal((await call('b', 'problems')).data.problems.length, 0);
  assert.equal((await call('b', `drafts/${id}`)).status, 404);
  assert.equal((await call('b', `drafts/${id}`, 'PUT', { code: 'x', stdin: '', expected: '', baseVersion: null })).status, 404);
  assert.equal((await call('b', 'submissions', 'POST', { problemId: id, status: 'self_pass', code: '', stdout: '', stderr: '' })).status, 404);
  assert.equal((await call('b', 'plans/today', 'PUT', { plan: [{ problemId: id, completed: false }] })).status, 404);
  assert.equal((await call('b', 'export')).data.problems.length, 0);
});

test('draft version conflict preserves remote data and origin rejects writes', async () => {
  const { call } = fixture();
  const first = await call('a', 'drafts/sum', 'PUT', { code: 'one', stdin: '', expected: '', baseVersion: null });
  assert.equal(first.data.version, 1);
  const second = await call('a', 'drafts/sum', 'PUT', { code: 'two', stdin: '', expected: '', baseVersion: 1 });
  assert.equal(second.data.version, 2);
  const conflict = await call('a', 'drafts/sum', 'PUT', { code: 'stale', stdin: '', expected: '', baseVersion: 1 });
  assert.equal(conflict.status, 409);
  assert.equal(conflict.data.current.code, 'two');
  assert.equal((await call('a', 'drafts/sum')).data.draft.code, 'two');
  assert.equal((await call('a', 'drafts/sum', 'PUT', { code: 'evil', stdin: '', expected: '', baseVersion: 2 }, 'https://evil.example')).status, 403);
});

test('exported problem JSON can preserve multiple cases', async () => {
  const { call } = fixture();
  const cases = [{ stdin: '1\n', expected: 'one\n' }, { stdin: '2\n', expected: 'two\n' }];
  const created = await call('a', 'problems', 'POST', { title: 'Cases', cases, rawSamples: ['one', 'two'] });
  assert.equal(created.status, 201);
  const exported = await call('a', 'export');
  assert.deepEqual(exported.data.problems[0].cases, cases);
  assert.equal((await call('a', 'problems', 'POST', exported.data.problems[0])).status, 409);
});
