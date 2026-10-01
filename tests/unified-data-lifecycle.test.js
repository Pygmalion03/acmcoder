import test from 'node:test';
import assert from 'node:assert/strict';
import {IDBFactory} from 'fake-indexeddb';
import {createBrowserStore} from '../shared/browser-store.js';
const create=()=>createBrowserStore({namespace:crypto.randomUUID(),indexedDB:new IDBFactory(),storage:null});
test('a real rewrite backup previews and restores idempotently without false snapshot conflicts',async()=>{
 const store=create();await store.putRecord({kind:'problem',id:'one',payload:{title:'One'}});
 await store.saveDraft({problemId:'one',language:'python',code:'original',stdin:'1',expected:'2'});
 await store.startRewrite({problemId:'one',language:'python',template:'rewritten'});await store.finishRewrite({problemId:'one',language:'python'});
 const backup=await store.exportBackup();
 for(const result of [await store.previewBackup(backup),await store.restoreBackup(backup)]){
  assert.equal(result.conflicts.length,0);assert.equal(result.imported,0);assert.equal(result.skipped,backup.records.length);
 }
 assert.deepEqual(await store.getMeta('backup:pending'),[]);
});
test('permanent deletion previews the full scope and removes plan references while preserving other questions',async()=>{
 const store=create();for(const id of ['one','two'])await store.putRecord({kind:'problem',id,payload:{title:id}});
 await store.saveDraft({problemId:'one',language:'python',code:'old',stdin:'1',expected:'2'});await store.startRewrite({problemId:'one',language:'python',template:''});
 for(const kind of ['run','review','conversation'])await store.putRecord({kind,id:kind,problemId:'one',payload:kind==='conversation'?{messages:[]}:{}});
 await store.putRecord({kind:'plan',id:'day',payload:{completed:{one:true,two:false}}});
 await store.putRecord({kind:'plan',id:'legacy-day',payload:{items:[{problemId:'one',completed:true},{problemId:'two',completed:false}]}});
 const before=await store.exportBackup(),preview=await store.previewDeleteProblem('one');
 assert.equal(preview.title,'one');assert.deepEqual(preview.counts,{problem:1,run:1,review:1,conversation:1,plan:2,draft:1,attempt:1});
 assert.deepEqual((await store.exportBackup()).records,before.records);
 await store.deleteProblem('one',{confirmed:true});
 assert.deepEqual((await store.getRecord({kind:'plan',id:'day'})).payload.completed,{two:false});
 assert.deepEqual((await store.getRecord({kind:'plan',id:'legacy-day'})).payload.items,[{problemId:'two',completed:false}]);
 const after=await store.exportBackup();assert.equal(after.records.some(r=>r.problemId==='one'||r.kind==='problem'&&r.id==='one'),false);
 assert.equal((await store.getRecord({kind:'problem',id:'two'})).payload.title,'two');assert.ok(await store.getMeta('deleted:one'));
});
test('permanent deletion removes matching pending backup versions but retains unrelated conflicts',async()=>{
 const store=create();for(const id of ['one','two'])await store.putRecord({kind:'problem',id,payload:{title:id}});
 const incoming={version:3,records:['one','two'].map(id=>({kind:'problem',id,payload:{title:`incoming-${id}`}}))};
 await store.restoreBackup(incoming);assert.equal((await store.getMeta('backup:pending'))[0].conflicts.length,2);
 await store.deleteProblem('one',{confirmed:true});
 const pending=(await store.exportBackup()).pendingRestores;assert.equal(pending.length,1);
 assert.deepEqual(pending[0].conflicts.map(c=>c.id),['two']);assert.deepEqual(pending[0].backup.records.map(r=>r.id),['two']);
});
test('backup preview validates references and reports conflicts without writing; confirmation rechecks newer edits',async()=>{
  const store=create();
  await store.putRecord({kind:'problem',id:'one',payload:{title:'One'}});
  await store.saveDraft({problemId:'one',language:'python',code:'local',stdin:'',expected:''});
  const incoming={version:3,records:[{kind:'problem',id:'two',payload:{title:'Two'}},{kind:'problem',id:'one',payload:{title:'One'}},{kind:'draft',id:'one--python',problemId:'one',language:'python',payload:{code:'incoming',stdin:'',expected:'',mode:'normal'}}]};
  const before=await store.exportBackup();
  const preview=await store.previewBackup(incoming);
  assert.equal(preview.imported,1);assert.equal(preview.skipped,1);assert.equal(preview.conflicts.length,1);
  assert.deepEqual(preview.counts,{problem:2,draft:1});
  const after=await store.exportBackup();assert.deepEqual(after.records,before.records);assert.deepEqual(after.pendingRestores,before.pendingRestores);
  await store.saveDraft({problemId:'one',language:'python',code:'newer local',stdin:'',expected:''});
  const result=await store.restoreBackup(incoming);assert.equal(result.conflicts.length,1);
  assert.equal((await store.getDraft({problemId:'one',language:'python'})).code,'newer local');
  await assert.rejects(store.previewBackup({version:3,records:[{kind:'draft',id:'two--python',problemId:'two',language:'python',payload:{code:'rewrite',stdin:'',expected:'',mode:'rewrite',previousAttemptId:'missing'}}]}),/缺失.*快照/);
});
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

test('restore conflicts persist through reopen and export, and copy restores history without overwriting originals',async()=>{
 const indexedDB=new IDBFactory(),namespace=crypto.randomUUID();let store=createBrowserStore({namespace,indexedDB,storage:null});
 await store.putRecord({kind:'problem',id:'one',payload:{title:'One'}});await store.saveDraft({problemId:'one',language:'python',code:'original',stdin:'',expected:''});
 const backup={version:3,records:[{kind:'problem',id:'one',payload:{title:'Restored'}},{kind:'attempt',id:'before',problemId:'one',language:'python',payload:{code:'old',stdin:'',expected:'',reason:'before-rewrite',createdAt:1}},{kind:'draft',id:'one--python',problemId:'one',language:'python',payload:{code:'incoming',stdin:'input',expected:'',mode:'rewrite',previousAttemptId:'before'}},{kind:'conversation',id:'one--python',problemId:'one',language:'python',payload:{messages:[{role:'user',content:'restored chat'}]}}]};
 const result=await store.restoreBackup(backup);assert.equal(result.conflicts.length,2);
 store=createBrowserStore({namespace,indexedDB,storage:null});const pending=await store.getMeta('backup:pending');assert.equal(pending.length,1);
 const exported=await store.exportBackup();assert.equal(exported.pendingRestores[0].backup.records.find(r=>r.kind==='draft').payload.code,'incoming');
 const other=create();await other.restoreBackup(exported);assert.equal((await other.getMeta('backup:pending')).length,1);
 const copied=await store.backupCopyConflict(pending[0].id),id=copied.problemIds[0];assert.notEqual(id,'one');
 const draft=await store.getDraft({problemId:id,language:'python'});assert.equal(draft.code,'incoming');assert.equal(draft.stdin,'input');
 assert.equal((await store.listAttempts({problemId:id})).items.find(r=>r.id===draft.previousAttemptId).code,'old');
 assert.equal((await store.getRecord({kind:'conversation',id:`${id}--python`})).payload.messages[0].content,'restored chat');
 assert.equal((await store.getDraft({problemId:'one',language:'python'})).code,'original');assert.equal((await store.getMeta('backup:pending')).length,0);
 await assert.rejects(store.backupCopyConflict(pending[0].id),/已处理/);
});

test('a deleted backup restores to a new ID without resurrecting the original',async()=>{
 const store=create();await store.putRecord({kind:'problem',id:'one',payload:{title:'One'}});await store.deleteProblem('one',{confirmed:true});
 await store.restoreBackup({version:3,records:[{kind:'problem',id:'one',payload:{title:'Old'}}]});
 const [pending]=await store.getMeta('backup:pending'),copy=await store.backupCopyConflict(pending.id);assert.equal(await store.getRecord({kind:'problem',id:'one'}),null);assert.equal((await store.getRecord({kind:'problem',id:copy.problemIds[0]})).payload.title,'Old · 恢复副本');
});

test('a conflicting immutable snapshot does not attach an incoming draft to the wrong history',async()=>{
 const store=create();await store.putRecord({kind:'problem',id:'one',payload:{title:'One'}});
 const snapshot={kind:'attempt',id:'before',problemId:'one',language:'python',payload:{code:'local history',stdin:'',expected:'',reason:'before-rewrite',createdAt:1}};
 // Attempts live in their own table, restored through the backup interface.
 await store.restoreBackup({version:3,records:[{kind:'problem',id:'one',payload:{title:'One'}},snapshot]});
 const incoming={...snapshot,payload:{...snapshot.payload,code:'incoming history'}};
 const result=await store.restoreBackup({version:3,records:[{kind:'problem',id:'one',payload:{title:'One'}},incoming,{kind:'draft',id:'one--python',problemId:'one',language:'python',payload:{code:'rewrite',stdin:'',expected:'',mode:'rewrite',previousAttemptId:'before'}}]});
 assert.equal(await store.getDraft({problemId:'one',language:'python'}),null);assert.ok(result.conflicts.some(c=>c.kind==='draft'));
 const pending=(await store.getMeta('backup:pending')).at(-1),copy=await store.backupCopyConflict(pending.id),id=copy.problemIds[0];
 const draft=await store.getDraft({problemId:id,language:'python'});assert.equal((await store.listAttempts({problemId:id})).items.find(r=>r.id===draft.previousAttemptId).code,'incoming history');
});
