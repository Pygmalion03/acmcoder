import test from 'node:test';
import assert from 'node:assert/strict';
import {IDBFactory} from 'fake-indexeddb';
import {createBrowserStore} from '../shared/browser-store.js';
import {createRecordRepository} from '../cloudflare/lib/records.js';
import {createSyncRepository} from '../cloudflare/lib/sync.js';
import {createTestDatabase} from './helpers/d1.js';
import {createSyncEngine} from '../shared/sync.js';

const problem={kind:'problem',id:'sum',payload:{title:'求和'}};
const draft={problemId:'sum',language:'python',code:'原代码',stdin:'输入',expected:'输出'};
function setup(){
 const {db}=createTestDatabase(),repo=createRecordRepository(db),remote=createSyncRepository(db,repo);
 const device=()=>{const store=createBrowserStore({namespace:'account:a',indexedDB:new IDBFactory(),storage:null,sync:true});const transport={migrate:async()=>{},push:mutations=>remote.push({userId:'a',mutations}),pull:cursor=>remote.pull({userId:'a',cursor,limit:2})};return {store,transport,engine:createSyncEngine({store,transport,accountId:'a'})};};
 return {repo,remote,device};
}
test('two devices resume code and rewrite with immutable snapshots',async()=>{
 const {device}=setup(),a=device(),b=device();
 await a.store.putRecord(problem);await a.store.saveDraft(draft);await a.engine.syncNow();assert.equal(a.engine.getStatus().state,'saved');
 await b.engine.syncNow();assert.equal((await b.store.getDraft(draft)).code,'原代码');
 await b.store.startRewrite({...draft,template:''});await b.store.saveDraft({...await b.store.getDraft(draft),code:'重写'});await b.store.finishRewrite(draft);await b.engine.syncNow();await a.engine.syncNow();
 assert.equal((await a.store.getDraft(draft)).code,'重写');assert.equal((await a.store.listAttempts(draft)).items.length,2);
});
test('offline conflicts survive reopen, resolving local uses cloud revision',async()=>{
 const {device}=setup(),a=device(),b=device();await a.store.putRecord(problem);await a.store.saveDraft(draft);await a.engine.syncNow();await b.engine.syncNow();
 await a.store.saveDraft({...await a.store.getDraft(draft),code:'A'});await b.store.saveDraft({...await b.store.getDraft(draft),code:'B'});await a.engine.syncNow();await b.engine.syncNow();
 const [conflict]=await b.store.syncConflicts();assert.equal(conflict.local.payload.code,'B');assert.equal(conflict.remote.payload.code,'A');assert.equal((await b.store.getDraft(draft)).code,'B');
 await b.store.syncResolve(conflict.key,'local');await b.engine.syncNow();await a.engine.syncNow();assert.equal((await a.store.getDraft(draft)).code,'B');
});
test('lost acknowledgement retries once; edits during upload retain later code',async()=>{
 const {device,repo}=setup(),a=device();await a.store.putRecord(problem);await a.store.saveDraft(draft);await a.engine.syncNow();
 await a.store.saveDraft({...draft,code:'first'});const [mutation]=await a.store.syncStage();const response=await a.transport.push([mutation]);await a.store.saveDraft({...draft,code:'second'});
 const [retry]=await a.store.syncStage();assert.deepEqual(retry,mutation);assert.deepEqual(await a.transport.push([retry]),response);
 await a.store.syncAcknowledge(response);await a.engine.syncNow();assert.equal((await repo.get({userId:'a',kind:'draft',id:'sum--python'})).payload.code,'second');
});
test('remote permanent deletion cancels stale device writes and retains conflict copy',async()=>{
 const {device,repo}=setup(),a=device(),b=device();await a.store.putRecord(problem);await a.store.saveDraft(draft);await a.engine.syncNow();await b.engine.syncNow();
 await b.store.saveDraft({...await b.store.getDraft(draft),code:'offline'});await a.store.deleteProblem('sum',{confirmed:true});await a.engine.syncNow();await b.engine.syncNow();
 assert.equal(await b.store.getDraft(draft),null);assert.equal(await b.store.getRecord({kind:'problem',id:'sum'}),null);assert.equal((await b.store.syncConflicts())[0].local.payload.code,'offline');
 assert.equal((await repo.get({userId:'a',kind:'draft',id:'sum--python'})).deleted,true);assert.equal(await b.store.syncPendingCount(),0);
});
test('pull cursor only changes after atomic persistence; failed validation leaves entire page unchanged',async()=>{
 const {device,remote}=setup(),a=device();await assert.rejects(a.store.syncPullPage({nextCursor:99,changes:[{...problem,revision:1},{kind:'draft',id:'bad',revision:1,payload:{}}]}));
 assert.equal(await a.store.getMeta('sync:cursor'),undefined);assert.equal(await a.store.getRecord({kind:'problem',id:'sum'}),null);
 await assert.rejects(remote.pull({userId:'a',cursor:-1}),/INVALID/);
 assert.throws(()=>createSyncEngine({store:a.store,accountId:'b',transport:a.transport}),/NAMESPACE/);
});

test('an editor opened before remote changes cannot silently overwrite the newer revision',async()=>{
 const {device,repo}=setup(),a=device(),b=device();await a.store.putRecord(problem);await a.store.saveDraft(draft);await a.engine.syncNow();await b.engine.syncNow();
 const opened=await b.store.getDraft(draft);
 await a.store.saveDraft({...await a.store.getDraft(draft),code:'new remote'});await a.engine.syncNow();await b.engine.syncNow();
 await b.store.saveDraft({...opened,code:'typed in stale editor'});await b.engine.syncNow();
 assert.equal((await b.store.syncConflicts())[0].local.payload.code,'typed in stale editor');
 assert.equal((await repo.get({userId:'a',kind:'draft',id:'sum--python'})).payload.code,'new remote');
});

test('copying a conflict preserves rewrite history under new IDs and keeps the cloud original',async()=>{
 const {device}=setup(),a=device(),b=device();await a.store.putRecord({...problem,payload:{title:'求和',statement:'原题面',rawSamples:['输入 1 2，输出 3']}});await a.store.saveDraft(draft);await a.engine.syncNow();await b.engine.syncNow();
 await b.store.startRewrite({...draft,template:''});await b.store.saveDraft({...await b.store.getDraft(draft),code:'离线重写'});
 await a.store.saveDraft({...await a.store.getDraft(draft),code:'云端新版'});await a.engine.syncNow();await b.engine.syncNow();
 const [conflict]=await b.store.syncConflicts();const copy=await b.store.syncCopyConflict(conflict.key);
 assert.notEqual(copy.problemId,'sum');assert.equal((await b.store.getDraft(draft)).code,'云端新版');
 const copied=await b.store.getDraft({problemId:copy.problemId,language:'python'});assert.equal(copied.code,'离线重写');assert.equal(copied.mode,'rewrite');
 const previous=(await b.store.listAttempts({problemId:copy.problemId})).items.find(r=>r.id===copied.previousAttemptId);assert.equal(previous.code,'原代码');assert.equal(previous.problemId,copy.problemId);
 assert.equal((await b.store.getRecord({kind:'problem',id:copy.problemId})).payload.statement,'原题面');assert.deepEqual(await b.store.syncConflicts(),[]);
 await b.engine.syncNow();await a.engine.syncNow();assert.equal((await a.store.getDraft({problemId:copy.problemId,language:'python'})).code,'离线重写');assert.equal((await a.store.getDraft(draft)).code,'云端新版');
 await assert.rejects(b.store.syncCopyConflict(conflict.key),/冲突已处理/);
});

test('editing after a conflict keeps the latest local content in the conflict copy',async()=>{
 const {device}=setup(),a=device(),b=device();await a.store.putRecord(problem);await a.store.saveDraft(draft);await a.engine.syncNow();await b.engine.syncNow();
 await a.store.saveDraft({...await a.store.getDraft(draft),code:'cloud'});await b.store.saveDraft({...await b.store.getDraft(draft),code:'first local'});await a.engine.syncNow();await b.engine.syncNow();
 await b.store.saveDraft({...await b.store.getDraft(draft),code:'last local',stdin:'last input'});
 const [conflict]=await b.store.syncConflicts();assert.equal(conflict.local.payload.code,'last local');assert.equal(conflict.remote.payload.code,'cloud');
 const copy=await b.store.syncCopyConflict(conflict.key);assert.equal((await b.store.getDraft({problemId:copy.problemId,language:'python'})).code,'last local');
 assert.equal((await b.store.getDraft({problemId:copy.problemId,language:'python'})).stdin,'last input');
 await b.engine.syncNow();await a.engine.syncNow();assert.equal((await a.store.getDraft({problemId:copy.problemId,language:'python'})).code,'last local');
});

test('copy after cloud deletion recovers the statement and snapshots without resurrecting deleted IDs',async()=>{
 const {device,repo}=setup(),a=device(),b=device();await a.store.putRecord({...problem,payload:{title:'求和',statement:'删除前题面',rawSamples:['原始样例']}});await a.store.saveDraft(draft);await a.engine.syncNow();await b.engine.syncNow();
 await b.store.startRewrite({...draft,template:''});await b.store.saveDraft({...await b.store.getDraft(draft),code:'删除期间离线重写'});
 await a.store.deleteProblem('sum',{confirmed:true});await a.engine.syncNow();await b.engine.syncNow();
 const [conflict]=await b.store.syncConflicts();const copy=await b.store.syncCopyConflict(conflict.key);
 assert.equal((await b.store.getRecord({kind:'problem',id:copy.problemId})).payload.statement,'删除前题面');
 assert.equal((await b.store.listAttempts({problemId:copy.problemId})).items[0].code,'原代码');
 await b.engine.syncNow();await a.engine.syncNow();assert.equal((await repo.get({userId:'a',kind:'problem',id:'sum'})).deleted,true);assert.equal(await b.store.getDraft(draft),null);
 assert.equal((await a.store.getDraft({problemId:copy.problemId,language:'python'})).code,'删除期间离线重写');assert.deepEqual(await b.store.syncConflicts(),[]);
});

test('temporary network errors retry with backoff and automatically deliver the durable queue',async()=>{
 const {device}=setup(),a=device();await a.store.putRecord(problem);await a.store.saveDraft(draft);
 let now=0,scheduled=[],online=false;const engine=createSyncEngine({store:a.store,accountId:'a',transport:{...a.transport,pull:async cursor=>{if(!online)throw new TypeError('offline');return a.transport.pull(cursor);}},clock:()=>now,setTimeout:(fn,delay)=>{const job={fn,at:now+delay};scheduled.push(job);return job;},clearTimeout:job=>{scheduled=scheduled.filter(x=>x!==job);}});
 await engine.syncNow();assert.equal(engine.getStatus().state,'retrying');assert.ok(engine.getStatus().nextRetryAt>now);assert.ok(await a.store.syncPendingCount());
 const before=engine.getStatus().nextRetryAt;await engine.syncNow({automatic:true});assert.equal(engine.getStatus().nextRetryAt,before);assert.equal(scheduled.length,1);
 const first=scheduled.shift();now=first.at;await first.fn();const second=scheduled.shift();assert.ok(second.at-now>first.at);
 online=true;now=second.at;await second.fn();assert.equal(await a.store.syncPendingCount(),0);assert.equal(engine.getStatus().state,'saved');assert.equal(scheduled.length,0);
});

test('pause cancels retry and quota failures retain work without automatic retries',async()=>{
 const {device}=setup(),a=device();await a.store.putRecord(problem);let scheduled=[];
 const timers={setTimeout:(fn,delay)=>{const job={fn,delay};scheduled.push(job);return job;},clearTimeout:job=>{scheduled=scheduled.filter(x=>x!==job);}};
 const engine=createSyncEngine({store:a.store,accountId:'a',transport:{...a.transport,pull:async()=>{throw new TypeError('offline');}},...timers});await engine.syncNow();assert.equal(scheduled.length,1);engine.pause();assert.equal(scheduled.length,0);assert.equal(engine.getStatus().state,'paused');
 const quota=createSyncEngine({store:a.store,accountId:'a',transport:{...a.transport,push:async()=>({applied:[],conflicts:[],errors:[{code:'CAPACITY_REACHED'}]})},...timers});await quota.syncNow();assert.equal(quota.getStatus().state,'error');assert.equal(scheduled.length,0);assert.ok(await a.store.syncPendingCount());
});

test('conflict copies keep the canonical AI conversation ID readable after cloud sync',async()=>{
 const {device}=setup(),a=device(),b=device();await a.store.putRecord(problem);await a.store.saveDraft(draft);
 await a.store.putRecord({kind:'conversation',id:'sum--python',problemId:'sum',language:'python',payload:{messages:[{role:'user',content:'保留对话'}]}});
 await a.engine.syncNow();await b.engine.syncNow();
 await a.store.saveDraft({...draft,code:'cloud'});await b.store.saveDraft({...draft,code:'local'});await a.engine.syncNow();await b.engine.syncNow();
 const [conflict]=await b.store.syncConflicts(),copy=await b.store.syncCopyConflict(conflict.key);
 const id=`${copy.problemId}--python`;assert.equal((await b.store.getRecord({kind:'conversation',id}))?.payload.messages[0].content,'保留对话');
 await b.engine.syncNow();await a.engine.syncNow();assert.equal((await a.store.getRecord({kind:'conversation',id}))?.problemId,copy.problemId);
});

test('daily run limit retains the durable queue across reopen, syncs drafts, and resumes after UTC reset',async()=>{
 const {db}=createTestDatabase();let now=Date.parse('2026-10-01T12:00:00Z');
 const repo=createRecordRepository(db,{clock:()=>now,limits:{dailyRuns:1}}),remote=createSyncRepository(db,repo);
 const indexedDB=new IDBFactory(),options={namespace:'account:a',indexedDB,storage:null,sync:true};
 let store=createBrowserStore(options),jobs=[];
 const timers={clock:()=>now,setTimeout:(fn,delay)=>{const job={fn,at:now+delay};jobs.push(job);return job;},clearTimeout:job=>{jobs=jobs.filter(x=>x!==job);}};
 const transport={migrate:async()=>{},push:mutations=>remote.push({userId:'a',mutations}),pull:cursor=>remote.pull({userId:'a',cursor})};
 let engine=createSyncEngine({store,accountId:'a',transport,...timers});
 await store.putRecord(problem);await store.saveDraft(draft);
 for(const id of ['first','second'])await store.putRecord({kind:'run',id,problemId:'sum',language:'python',payload:{stdout:id,status:'self_pass'}});
 await engine.syncNow();assert.equal(engine.getStatus().state,'quota');assert.equal(await store.syncPendingCount(),1);
 assert.equal((await repo.get({userId:'a',kind:'draft',id:'sum--python'})).payload.code,'原代码');
 assert.equal((await store.exportBackup()).records.filter(r=>r.kind==='run').length,2);
 assert.equal(jobs.length,1);assert.equal(jobs[0].at,Date.parse('2026-10-02T00:00:00Z'));
 engine.pause();assert.equal(jobs.length,0);await store.flush();
 store=createBrowserStore(options);engine=createSyncEngine({store,accountId:'a',transport,...timers});
 await store.saveDraft({...await store.getDraft(draft),code:'quota期间继续编辑'});await engine.syncNow();
 assert.equal(engine.getStatus().state,'quota');assert.equal((await repo.get({userId:'a',kind:'draft',id:'sum--python'})).payload.code,'quota期间继续编辑');
 assert.equal(await store.syncPendingCount(),1);assert.equal(jobs.length,1);
 const retry=jobs.shift();now=retry.at;await retry.fn();
 assert.equal(engine.getStatus().state,'saved');assert.equal(await store.syncPendingCount(),0);assert.equal((await repo.list({userId:'a',kind:'run'})).items.length,2);
 engine.pause();
});
