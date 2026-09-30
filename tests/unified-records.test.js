import test from 'node:test';
import assert from 'node:assert/strict';
import { createTestDatabase } from './helpers/d1.js';
import { createRecordRepository } from '../cloudflare/lib/records.js';
import { validateRecord } from '../shared/records.js';

const put = (kind, id, payload, extra = {}) => ({ mutationId: crypto.randomUUID(), kind, id, op: 'put', baseRevision: 0, payload, ...extra });
const problem = () => put('problem', 'sum', { title: '相加', statement: '求和', cases: [], archivedAt: null });
const draft = (id, language, code) => put('draft', id, { code, stdin: '', expected: '', mode: 'normal', previousAttemptId: null }, { problemId: 'sum', language });

test('language drafts are independent, owner isolated, and stale writes preserve both versions', async () => {
  const { db } = createTestDatabase(); const repo = createRecordRepository(db);
  await repo.apply({ userId: 'a', mutation: problem() });
  await repo.apply({ userId: 'a', mutation: draft('py', 'python', 'print(1)') });
  await repo.apply({ userId: 'a', mutation: draft('cpp', 'cpp', 'int main() {}') });
  assert.equal((await repo.get({ userId: 'a', kind: 'draft', id: 'py' })).payload.code, 'print(1)');
  assert.equal((await repo.get({ userId: 'a', kind: 'draft', id: 'cpp' })).language, 'cpp');
  assert.equal(await repo.get({ userId: 'b', kind: 'draft', id: 'py' }), null);
  const stale = await repo.apply({ userId: 'a', mutation: draft('py', 'python', 'stale') });
  assert.equal(stale.conflicts[0].current.payload.code, 'print(1)');
});

test('mutation retries are idempotent and changed replay is rejected', async () => {
  const { db, sqlite } = createTestDatabase(); const repo = createRecordRepository(db);
  const mutation = problem();
  const first = await repo.apply({ userId: 'a', mutation });
  assert.deepEqual(await repo.apply({ userId: 'a', mutation }), first);
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM record_changes').get().n, 1);
  await assert.rejects(repo.apply({ userId: 'a', mutation: { ...mutation, payload: { title: 'different' } } }), /MUTATION_REUSED/);
});

test('concurrent revisions have one winner, and capacity refusal leaves no partial mutation', async () => {
  const { db, sqlite } = createTestDatabase(); const repo = createRecordRepository(db, { limits: { userBytes: 4000, globalBytes: 8000, problems: 1 } });
  await repo.apply({ userId: 'a', mutation: problem() });
  const results = await Promise.all(['one','two'].map(title => repo.apply({ userId: 'a', mutation: put('problem','sum',{ title },{ baseRevision: 1 }) })));
  assert.equal(results.filter(r => r.applied.length).length, 1);
  assert.equal(results.filter(r => r.conflicts.length).length, 1);
  const count = sqlite.prepare('SELECT COUNT(*) AS n FROM record_mutations').get().n;
  await assert.rejects(repo.apply({ userId: 'a', mutation: put('problem', 'extra', { title: 'Extra' }) }), /CAPACITY_REACHED/);
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM record_mutations').get().n, count);
});

test('deleted ids cannot be resurrected and immutable attempts cannot be overwritten', async () => {
  const { db } = createTestDatabase(); const repo = createRecordRepository(db);
  await repo.apply({ userId: 'a', mutation: problem() });
  const snapshot = put('attempt', 'before', { code: 'old', stdin: '', expected: '', reason: 'before-rewrite', createdAt: 1 }, { problemId: 'sum', language: 'python' });
  await repo.apply({ userId: 'a', mutation: snapshot });
  await assert.rejects(repo.apply({ userId: 'a', mutation: { ...snapshot, mutationId: crypto.randomUUID(), baseRevision: 1 } }), /IMMUTABLE/);
  await repo.apply({ userId: 'a', mutation: { mutationId: 'delete-sum', kind: 'problem', id: 'sum', baseRevision: 1, op: 'delete' } });
  const resurrection = await repo.apply({ userId: 'a', mutation: problem() });
  assert.equal(resurrection.applied.length, 0);
  assert.equal(resurrection.conflicts[0].current.deleted, true);
  assert.equal((await repo.get({ userId: 'a', kind: 'problem', id: 'sum' })).payload, null);
});

test('legacy migration resumes without duplicates and preserves old code', async () => {
  const { db, sqlite } = createTestDatabase(); const repo = createRecordRepository(db);
  sqlite.prepare('INSERT INTO drafts (user_id,problem_id,code,stdin,expected,version,updated_at) VALUES (?,?,?,?,?,1,1)').run('a','sum','历史代码','1','2');
  let cursor = null;
  do { ({ nextCursor: cursor } = await repo.migrateLegacy({ userId:'a', cursor, limit: 2 })); } while (cursor);
  await repo.migrateLegacy({ userId:'a', limit: 2 });
  const drafts = await repo.list({ userId: 'a', kind:'draft' });
  assert.equal(drafts.items.length, 1);
  assert.equal(drafts.items[0].payload.code, '历史代码');
  assert.equal(drafts.items[0].language, 'python');
});

test('record validation rejects credentials in settings and invalid draft payloads', () => {
  assert.throws(() => validateRecord({ kind:'settings', id:'settings', revision:0, payload:{ apiKey:'secret' } }), /CREDENTIAL/);
  assert.throws(() => validateRecord({ kind:'draft', id:'draft', problemId:'sum', language:'python', payload:{ code:42 } }), /INVALID/);
});
