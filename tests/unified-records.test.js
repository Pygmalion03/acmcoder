import test from 'node:test';
import assert from 'node:assert/strict';
import { createTestDatabase } from './helpers/d1.js';
import { createRecordRepository } from '../cloudflare/lib/records.js';
import { validateRecord } from '../shared/records.js';

const put = (kind, id, payload, extra = {}) => ({ mutationId: crypto.randomUUID(), kind, id, op: 'put', baseRevision: 0, payload, ...extra });
const problem = () => put('problem', 'sum', { title: '相加', statement: '求和', cases: [], archivedAt: null });
const draft = (id, language, code) => put('draft', id, { code, stdin: '', expected: '', mode: 'normal', previousAttemptId: null }, { problemId: 'sum', language });
const run = id => put('run', id, {status:'self_pass',stdout:'42',stdin:'10 32',expected:'42'}, {problemId:'sum',language:'python'});

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
  assert.equal((await repo.get({ userId:'a',kind:'attempt',id:'before' })).deleted,true);
  await assert.rejects(repo.apply({userId:'a',mutation:draft('new-draft','python','resurrect child')}),/PROBLEM_NOT_FOUND/);
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

test('100 daily new runs survive quota refusal; retries, deletion, other records and next UTC day behave correctly', async () => {
  const {db,sqlite}=createTestDatabase();let now=Date.parse('2026-10-01T12:00:00Z');
  const repo=createRecordRepository(db,{clock:()=>now});await repo.apply({userId:'a',mutation:problem()});
  let last;
  for(let i=0;i<100;i++){last=run(`run-${i}`);await repo.apply({userId:'a',mutation:last});}
  const before=sqlite.prepare('SELECT COUNT(*) n FROM record_mutations').get().n;
  const blocked=run('run-100');
  await assert.rejects(repo.apply({userId:'a',mutation:blocked}),error=>error.message==='DAILY_RUN_LIMIT'&&error.retryAt===Date.parse('2026-10-02T00:00:00Z'));
  assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM record_mutations').get().n,before);
  assert.equal(await repo.get({userId:'a',kind:'run',id:'run-100'}),null);
  await repo.apply({userId:'a',mutation:last});
  await repo.apply({userId:'a',mutation:{mutationId:'delete-run',kind:'run',id:'run-0',baseRevision:1,op:'delete'}});
  assert.equal(sqlite.prepare('SELECT count FROM record_daily_runs WHERE user_id=? AND day=?').get('a','2026-10-01').count,100);
  await assert.rejects(repo.apply({userId:'a',mutation:blocked}),/DAILY_RUN_LIMIT/);
  await repo.apply({userId:'a',mutation:draft('py','python','still saves')});
  await repo.apply({userId:'b',mutation:problem()});await repo.apply({userId:'b',mutation:run('other-account')});
  now=Date.parse('2026-10-02T00:00:00Z');await repo.apply({userId:'a',mutation:blocked});
  assert.equal(sqlite.prepare('SELECT count FROM record_daily_runs WHERE user_id=? AND day=?').get('a','2026-10-02').count,1);
  let cursor=null,total=0;do{const page=await repo.list({userId:'a',kind:'run',cursor,limit:50});total+=page.items.length;cursor=page.nextCursor;}while(cursor);
  assert.equal(total,100); // 101 preserved rows, one explicitly deleted by the user.
  assert.equal(sqlite.prepare("SELECT COUNT(*) n FROM unified_records WHERE user_id='a' AND kind='run'").get().n,101);
});

test('concurrent last-slot runs have one winner and failed capacity commits do not consume run allowance', async () => {
  const {db,sqlite}=createTestDatabase();const repo=createRecordRepository(db,{limits:{dailyRuns:1,userBytes:4096}});
  await repo.apply({userId:'a',mutation:problem()});
  await assert.rejects(repo.apply({userId:'a',mutation:{...run('too-big'),payload:{stdout:'x'.repeat(10000)}}}),/CAPACITY_REACHED/);
  assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM record_daily_runs').get().n,0);
  const results=await Promise.allSettled(['one','two'].map(id=>repo.apply({userId:'a',mutation:run(id)})));
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
  assert.equal(results.find(r=>r.status==='rejected').reason.message,'DAILY_RUN_LIMIT');
  assert.equal(sqlite.prepare('SELECT count FROM record_daily_runs').get().count,1);
  assert.equal(sqlite.prepare("SELECT COUNT(*) n FROM unified_records WHERE kind='run'").get().n,1);
});

test('legacy runs beyond the daily allowance migrate completely without charging newly synced activity', async () => {
  const {db,sqlite}=createTestDatabase();const repo=createRecordRepository(db,{limits:{dailyRuns:1}});
  for(let i=0;i<106;i++)sqlite.prepare('INSERT INTO submissions(id,user_id,problem_id,status,code,created_at) VALUES(?,?,?,?,?,?)').run(`old-run-${i}`,'a','sum','self_pass',`print(${i})`,1);
  let cursor=null;do{({nextCursor:cursor}=await repo.migrateLegacy({userId:'a',cursor,limit:25}));}while(cursor);
  assert.equal(sqlite.prepare("SELECT COUNT(*) n FROM unified_records WHERE kind='run'").get().n,106);
  assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM record_daily_runs').get().n,0);
  await repo.apply({userId:'a',mutation:run('new-run')});
  await assert.rejects(repo.apply({userId:'a',mutation:run('over-allowance')}),/DAILY_RUN_LIMIT/);
});

test('retained pre-quota SQL writers count new runs and roll back every part of an over-limit transaction',async()=>{
 const {db,sqlite}=createTestDatabase();
 sqlite.prepare('INSERT INTO record_daily_runs(user_id,day,count) VALUES(?,date(\'now\'),99)').run('a');
 sqlite.prepare('INSERT INTO record_usage(user_id,bytes) VALUES(?,0)').run('a');
 const write=id=>db.batch([
  db.prepare('INSERT INTO record_mutations(user_id,mutation_id,fingerprint,result_json) VALUES(?,?,?,?)').bind('a',id,'fixture-'+id,'{}'),
  db.prepare('UPDATE record_usage SET bytes=bytes+1024 WHERE user_id=?').bind('a'),
  db.prepare('UPDATE record_totals SET bytes=bytes+1024 WHERE id=1').bind(),
  db.prepare(`INSERT INTO unified_records(user_id,kind,id,problem_id,language,revision,updated_at,payload_json,deleted,bytes)
    VALUES(?,'run',?,'sum','python',1,?,'{"stdout":"42"}',0,512)
    ON CONFLICT(user_id,kind,id) DO UPDATE SET revision=excluded.revision`).bind('a',id,Date.now()),
  db.prepare('UPDATE record_mutations SET applied=changes() WHERE user_id=? AND mutation_id=?').bind('a',id),
 ]);
 await write('last-slot');assert.equal(sqlite.prepare('SELECT count FROM record_daily_runs').get().count,100);
 const baseline={bytes:sqlite.prepare('SELECT bytes FROM record_usage').get().bytes,global:sqlite.prepare('SELECT bytes FROM record_totals').get().bytes,changes:sqlite.prepare('SELECT COUNT(*) n FROM record_changes').get().n};
 await assert.rejects(write('legacy-run-forged-prefix'),/capacity_available: DAILY_RUN_LIMIT/);
 assert.equal(sqlite.prepare('SELECT bytes FROM record_usage').get().bytes,baseline.bytes);
 assert.equal(sqlite.prepare('SELECT bytes FROM record_totals').get().bytes,baseline.global);
 assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM record_changes').get().n,baseline.changes);
 assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM record_mutations WHERE mutation_id=?').get('legacy-run-forged-prefix').n,0);
 assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM unified_records WHERE kind=?').get('run').n,1);
 assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM record_run_reservations').get().n,0);
});

test('rc2 reservation SQL without the new record column charges once and leaves no reusable reservation',async()=>{
 const {db,sqlite}=createTestDatabase();
 const write=id=>db.batch([
  db.prepare('INSERT INTO record_mutations(user_id,mutation_id,fingerprint,result_json) VALUES(?,?,?,?)').bind('a',id,id,'{}'),
  db.prepare('INSERT INTO record_daily_runs(user_id,day,count) VALUES(?,date(\'now\'),1) ON CONFLICT(user_id,day) DO UPDATE SET count=count+1 WHERE count<100').bind('a'),
  db.prepare('UPDATE record_mutations SET run_quota_ok=changes() WHERE user_id=? AND mutation_id=?').bind('a',id),
  db.prepare('INSERT INTO unified_records(user_id,kind,id,revision,updated_at,payload_json,bytes) VALUES(?,\'run\',?,1,?,\'{}\',256)').bind('a',id,Date.now()),
  db.prepare('UPDATE record_mutations SET applied=changes() WHERE user_id=? AND mutation_id=?').bind('a',id),
 ]);
 await write('rc2-first');await write('rc2-second');
 assert.equal(sqlite.prepare('SELECT count FROM record_daily_runs').get().count,2);
 assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM record_run_reservations').get().n,0);
 sqlite.prepare('UPDATE record_daily_runs SET count=100').run();
 await assert.rejects(write('rc2-blocked'),/daily_run_available/);
 assert.equal(sqlite.prepare('SELECT count FROM record_daily_runs').get().count,100);
 assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM record_run_reservations').get().n,0);
});
