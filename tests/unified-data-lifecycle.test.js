import test from 'node:test';
import assert from 'node:assert/strict';
import {IDBFactory} from 'fake-indexeddb';
import {createBrowserStore} from '../shared/browser-store.js';
const create=()=>createBrowserStore({namespace:crypto.randomUUID(),indexedDB:new IDBFactory(),storage:null});
test('archive preserves drafts; permanent deletion removes only related data; backup restores snapshots',async()=>{
  const store=create();
  await store.putRecord({kind:'problem',id:'one',payload:{title:'One'}});
  await store.putRecord({kind:'problem',id:'two',payload:{title:'Two'}});
  await store.saveDraft({problemId:'one',language:'python',code:'old',stdin:'1',expected:'2'});
  await store.startRewrite({problemId:'one',language:'python',template:''});
  await store.archiveProblem('one');
  assert.ok((await store.getRecord({kind:'problem',id:'one'})).payload.archivedAt);
  assert.equal((await store.getDraft({problemId:'one',language:'python'})).mode,'rewrite');
  await store.restoreProblem('one');
  const backup=await store.exportBackup();
  const restored=create();
  await restored.restoreBackup(backup,{mode:'merge'});
  await restored.restoreBackup(backup,{mode:'merge'});
  assert.equal((await restored.listAttempts({problemId:'one'})).items.length,1);
  await assert.rejects(store.deleteProblem('one',{}));
  await store.deleteProblem('one',{confirmed:true});
  assert.equal(await store.getDraft({problemId:'one',language:'python'}),null);
  assert.equal((await store.listAttempts({problemId:'one'})).items.length,0);
  assert.equal((await store.getRecord({kind:'problem',id:'two'})).payload.title,'Two');
});

test('invalid linked snapshots cannot partially restore and plans survive export',async()=>{
  const store=create();
  await store.putRecord({kind:'plan',id:'today',payload:{day:'2026-09-30',items:[{problemId:'one',completed:true}]}});
  const backup=await store.exportBackup();
  assert.equal(backup.records[0].kind,'plan');
  const other=create();
  await assert.rejects(other.restoreBackup({version:3,records:[{kind:'problem',id:'one',payload:{title:'One'}},{kind:'draft',id:'one--python',problemId:'one',language:'python',payload:{code:'x',stdin:'',expected:'',mode:'rewrite',previousAttemptId:'missing'}}]}),/缺失.*快照/);
  assert.equal((await other.listRecords()).length,0);
});
