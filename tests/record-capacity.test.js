import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createTestDatabase} from './helpers/d1.js';
import {createRecordRepository} from '../cloudflare/lib/records.js';
import {createSyncRepository} from '../cloudflare/lib/sync.js';

const put=(kind,id,payload,extra={})=>({mutationId:crypto.randomUUID(),kind,id,op:'put',baseRevision:0,payload,...extra});
const remove=(kind,id,baseRevision=1)=>({mutationId:crypto.randomUUID(),kind,id,op:'delete',baseRevision});
const problem=()=>put('problem','sum',{title:'相加'});
const draft=(code,baseRevision=0)=>put('draft','sum--python',{code,stdin:'',expected:'',mode:'normal'},{problemId:'sum',language:'python',baseRevision});
const usage=(sqlite,userId='a')=>sqlite.prepare('SELECT bytes,problems FROM record_usage WHERE user_id=?').get(userId);
const globalBytes=sqlite=>sqlite.prepare('SELECT bytes FROM record_totals WHERE id=1').get().bytes;
const accounting=sqlite=>({
  usage:sqlite.prepare('SELECT * FROM record_usage ORDER BY user_id').all(),
  total:globalBytes(sqlite),
  mutations:sqlite.prepare('SELECT COUNT(*) n FROM record_mutations').get().n,
  changes:sqlite.prepare('SELECT COUNT(*) n FROM record_changes').get().n,
});

function assertBudgetMatchesRetainedRows(sqlite,userId) {
  const rows=sqlite.prepare('SELECT SUM(bytes) bytes FROM unified_records WHERE user_id=?').get(userId).bytes||0;
  const mutations=sqlite.prepare('SELECT COUNT(*) n FROM record_mutations WHERE user_id=?').get(userId).n;
  const changes=sqlite.prepare('SELECT COUNT(*) n FROM record_changes WHERE user_id=?').get(userId).n;
  assert.equal(usage(sqlite,userId).bytes,rows+384*mutations+128*changes);
  assert.equal(globalBytes(sqlite),sqlite.prepare('SELECT SUM(bytes) bytes FROM record_usage').get().bytes);
}

test('cascade deletion reclaims child payload budgets and retains replayable tombstones',async()=>{
  const {db,sqlite}=createTestDatabase();const repo=createRecordRepository(db,{clock:()=>1234567890000});
  for(const userId of ['a','b'])await repo.apply({userId,mutation:problem()});
  await repo.apply({userId:'a',mutation:draft('中文'.repeat(3000))});
  await repo.apply({userId:'a',mutation:put('conversation','conversation',{messages:[{role:'user',content:'问答'.repeat(4000)}]},{problemId:'sum',language:'python'})});
  await repo.apply({userId:'a',mutation:put('run','run',{stdout:'x'.repeat(2000)},{problemId:'sum',language:'python'})});
  const before=usage(sqlite).bytes,other=usage(sqlite,'b'),cursor=await repo.cursor('a');
  const mutation=remove('problem','sum'),first=await repo.apply({userId:'a',mutation});
  assert.ok(usage(sqlite).bytes<before-30000);
  assert.equal(usage(sqlite).problems,0);
  assert.deepEqual(usage(sqlite,'b'),other);
  assertBudgetMatchesRetainedRows(sqlite,'a');assertBudgetMatchesRetainedRows(sqlite,'b');
  const rows=sqlite.prepare("SELECT * FROM unified_records WHERE user_id='a'").all();
  assert.equal(rows.length,4);
  for(const row of rows){assert.equal(row.deleted,1);assert.equal(row.payload_json,null);assert.equal(row.bytes,128);assert.equal(row.revision,2);assert.equal(row.updated_at,1234567890000);}
  const pulled=await createSyncRepository(db,repo).pull({userId:'a',cursor});
  assert.equal(pulled.changes.length,4);assert.ok(pulled.changes.every(record=>record.deleted&&record.payload===null));
  const after=accounting(sqlite);
  assert.deepEqual(await repo.apply({userId:'a',mutation}),first);
  assert.deepEqual(accounting(sqlite),after);
  assert.equal(sqlite.prepare('SELECT count FROM record_daily_runs WHERE user_id=?').get('a').count,1);
});

test('a full budget cannot block deletion even when a tiny record needs more tombstone bookkeeping',async()=>{
  const {db,sqlite}=createTestDatabase();const repo=createRecordRepository(db);
  await repo.apply({userId:'a',mutation:problem()});
  const before=usage(sqlite).bytes;
  const limited=createRecordRepository(db,{limits:{userBytes:1,globalBytes:1,problems:1}});
  const result=await limited.apply({userId:'a',mutation:remove('problem','sum')});
  assert.equal(result.applied.length,1);assert.equal(usage(sqlite).problems,0);
  assert.ok(usage(sqlite).bytes>before,'the budget still charges the retained mutation and deletion change');
  assertBudgetMatchesRetainedRows(sqlite,'a');
  await assert.rejects(limited.apply({userId:'a',mutation:put('problem','new',{title:'new'})}),/CAPACITY_REACHED/);
});

test('an over-budget account can shrink content, while growth still rolls back completely',async()=>{
  const {db,sqlite}=createTestDatabase();const repo=createRecordRepository(db);
  await repo.apply({userId:'a',mutation:problem()});await repo.apply({userId:'a',mutation:draft('x'.repeat(10000))});
  const limited=createRecordRepository(db,{limits:{userBytes:1,globalBytes:1}}),before=usage(sqlite).bytes;
  assert.equal((await limited.apply({userId:'a',mutation:draft('short',1)})).applied.length,1);
  assert.ok(usage(sqlite).bytes<before);assertBudgetMatchesRetainedRows(sqlite,'a');
  const snapshot=accounting(sqlite);
  await assert.rejects(limited.apply({userId:'a',mutation:draft('larger again'.repeat(1000),2)}),/CAPACITY_REACHED/);
  assert.deepEqual(accounting(sqlite),snapshot);
  assert.equal((await repo.get({userId:'a',kind:'draft',id:'sum--python'})).payload.code,'short');
});

test('simultaneous duplicate mutations and competing deletes never charge or release twice',async()=>{
  const {db,sqlite}=createTestDatabase();const repo=createRecordRepository(db),initial=problem();
  const created=await Promise.all([repo.apply({userId:'a',mutation:initial}),repo.apply({userId:'a',mutation:initial})]);
  assert.deepEqual(created[0],created[1]);assert.equal(accounting(sqlite).mutations,1);
  await repo.apply({userId:'a',mutation:draft('x'.repeat(5000))});
  const deleted=await Promise.all([repo.apply({userId:'a',mutation:remove('problem','sum')}),repo.apply({userId:'a',mutation:remove('problem','sum')})]);
  assert.equal(deleted.filter(result=>result.applied.length).length,1);
  assert.equal(deleted.filter(result=>result.conflicts.length).length,1);
  assert.equal(accounting(sqlite).mutations,3);assert.equal(accounting(sqlite).changes,4);
  assertBudgetMatchesRetainedRows(sqlite,'a');
});

test('concurrent child changes and parent deletion account the rows actually committed',async()=>{
  const {db,sqlite}=createTestDatabase();const repo=createRecordRepository(db);
  await repo.apply({userId:'a',mutation:problem()});await repo.apply({userId:'a',mutation:draft('old')});
  const results=await Promise.allSettled([repo.apply({userId:'a',mutation:draft('x'.repeat(20000),1)}),repo.apply({userId:'a',mutation:remove('problem','sum')})]);
  assert.equal(results[1].status,'fulfilled');
  if(results[0].status==='rejected')assert.match(results[0].reason.message,/PROBLEM_NOT_FOUND/);
  assert.equal((await repo.get({userId:'a',kind:'draft',id:'sum--python'})).deleted,true);
  assertBudgetMatchesRetainedRows(sqlite,'a');
});

test('capacity migration repairs old counters without changing learning data, revisions, cursors or retries',async()=>{
  const {db,sqlite}=createTestDatabase(['0001_initial.sql','0002_restore_entries.sql','0003_unified_records.sql','0005_daily_run_quota.sql','0006_legacy_run_quota_guard.sql']);
  const repo=createRecordRepository(db),initial=problem();
  await repo.apply({userId:'a',mutation:initial});await repo.apply({userId:'a',mutation:draft('历史正文'.repeat(2000))});
  const saved=await repo.apply({userId:'b',mutation:problem()});
  // The previous cascade path removed payloads but retained their old bytes.
  sqlite.prepare("UPDATE unified_records SET payload_json=NULL,deleted=1,revision=revision+1 WHERE user_id='a'").run();
  const records=sqlite.prepare('SELECT user_id,kind,id,problem_id,language,revision,updated_at,payload_json,deleted FROM unified_records ORDER BY user_id,kind,id').all();
  const changes=sqlite.prepare('SELECT * FROM record_changes ORDER BY seq').all(),revisions=sqlite.prepare('SELECT * FROM user_data_revisions ORDER BY user_id').all();
  const mutations=sqlite.prepare('SELECT * FROM record_mutations ORDER BY user_id,mutation_id').all();
  const before=globalBytes(sqlite);
  sqlite.exec(readFileSync(new URL('../cloudflare/migrations/0007_record_capacity_repair.sql',import.meta.url),'utf8'));
  assert.ok(globalBytes(sqlite)<before-10000);
  assert.equal(usage(sqlite).problems,0);
  assertBudgetMatchesRetainedRows(sqlite,'a');assertBudgetMatchesRetainedRows(sqlite,'b');
  assert.deepEqual(sqlite.prepare('SELECT user_id,kind,id,problem_id,language,revision,updated_at,payload_json,deleted FROM unified_records ORDER BY user_id,kind,id').all(),records);
  assert.deepEqual(sqlite.prepare('SELECT * FROM record_changes ORDER BY seq').all(),changes);
  assert.deepEqual(sqlite.prepare('SELECT * FROM user_data_revisions ORDER BY user_id').all(),revisions);
  assert.deepEqual(sqlite.prepare('SELECT * FROM record_mutations ORDER BY user_id,mutation_id').all(),mutations);
  assert.equal(saved.applied.length,1);
  const cursor=await repo.cursor('b');
  await repo.apply({userId:'b',mutation:put('problem','sum',{title:'仍可更新'},{baseRevision:1})});
  assert.ok(await repo.cursor('b')>cursor,'the original sync-change trigger was restored');
  const prior=accounting(sqlite);await repo.apply({userId:'a',mutation:initial});assert.deepEqual(accounting(sqlite),prior);
});
