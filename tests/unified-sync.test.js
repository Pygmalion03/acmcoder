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
