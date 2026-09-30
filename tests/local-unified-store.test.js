import test from 'node:test';import assert from 'node:assert/strict';
import fs from 'node:fs/promises';import os from 'node:os';import path from 'node:path';
import {createLocalStore} from '../src/server/unified-store.js';
const key={problemId:'sum',language:'python'},draft={...key,code:'原代码',stdin:'中文输入',expected:'原输出'};
test('file PracticeStore persists all languages and shares atomic rewrite/history/backup behavior',async()=>{
  const dataDir=await fs.mkdtemp(path.join(os.tmpdir(),'acmcoder-store-'));
  try{
    let store=createLocalStore({dataDir});await store.putRecord({kind:'problem',id:'sum',payload:{title:'求和'}});
    for(const language of ['python','java','cpp'])await store.saveDraft({...draft,language});
    await store.startRewrite({...key,template:''});await store.saveDraft({...draft,code:'重写代码',mode:'rewrite',previousAttemptId:(await store.getDraft(key)).previousAttemptId});
    store=createLocalStore({dataDir});assert.equal((await store.getDraft(key)).code,'重写代码');await store.finishRewrite(key);assert.equal((await store.listAttempts(key)).items.length,2);
    const backup=await store.exportBackup();assert.equal(backup.records.filter(r=>r.kind==='draft').length,3);assert.equal(JSON.stringify(backup).includes('refreshToken'),false);
    await store.archiveProblem('sum');store=createLocalStore({dataDir});assert.ok((await store.getRecord({kind:'problem',id:'sum'})).payload.archivedAt);await store.restoreProblem('sum');
    await store.deleteProblem('sum',{confirmed:true});store=createLocalStore({dataDir});assert.equal(await store.getDraft(key),null);assert.equal((await store.restoreBackup(backup)).conflicts.length,6);
  }finally{await fs.rm(dataDir,{recursive:true,force:true});}
});
test('write failure keeps original draft and snapshots; completed recovery journal survives interrupted rename',async()=>{
  const dataDir=await fs.mkdtemp(path.join(os.tmpdir(),'acmcoder-crash-'));let phase=null;
  try{
    const store=createLocalStore({dataDir,beforeCommit:async({phase:p})=>{if(phase===p)throw new Error('disk failure');}});
    await store.putRecord({kind:'problem',id:'sum',payload:{title:'求和'}});await store.saveDraft(draft);
    phase='beforeJournal';await assert.rejects(store.startRewrite({...key,template:''}),/disk failure/);phase=null;
    assert.equal((await store.getDraft(key)).code,'原代码');assert.equal((await store.listAttempts(key)).items.length,0);
    phase='afterJournal';await assert.rejects(store.startRewrite({...key,template:'恢复中的新代码'}),/disk failure/);
    const recovered=createLocalStore({dataDir});assert.equal((await recovered.getDraft(key)).code,'恢复中的新代码');assert.equal((await recovered.listAttempts(key)).items.length,1);
  }finally{await fs.rm(dataDir,{recursive:true,force:true});}
});
test('account file copies retain sync outbox and conflicts across process restart',async()=>{
  const dataDir=await fs.mkdtemp(path.join(os.tmpdir(),'acmcoder-file-sync-'));
  try{
    let store=createLocalStore({dataDir,namespace:'account:a',sync:true});await store.putRecord({kind:'problem',id:'sum',payload:{title:'求和'}});await store.saveDraft(draft);
    const [mutation]=await store.syncStage();store=createLocalStore({dataDir,namespace:'account:a',sync:true});assert.deepEqual((await store.syncStage())[0],mutation);
    await store.syncPullPage({changes:[{kind:'draft',id:'sum--python',problemId:'sum',language:'python',revision:1,payload:{...draft,code:'云端代码',mode:'normal'}}],nextCursor:1});
    store=createLocalStore({dataDir,namespace:'account:a',sync:true});assert.equal((await store.syncConflicts()).length,1);assert.equal((await store.getDraft(key)).code,'原代码');assert.equal(await store.getMeta('sync:cursor'),1);
    assert.equal(await createLocalStore({dataDir,namespace:'account:b',sync:true}).getDraft(key),null);
  }finally{await fs.rm(dataDir,{recursive:true,force:true});}
});

test('conflict copy commits atomically and remains syncable after reopening the file store',async()=>{
 const dataDir=await fs.mkdtemp(path.join(os.tmpdir(),'acmcoder-copy-conflict-'));let fail=false;
 try{
  let store=createLocalStore({dataDir,namespace:'account:a',sync:true,beforeCommit:async()=>{if(fail)throw new Error('disk full');}});
  await store.syncPullPage({changes:[{kind:'problem',id:'sum',revision:1,payload:{title:'求和',statement:'完整题面'}},{kind:'draft',id:'sum--python',problemId:'sum',language:'python',revision:1,payload:{...draft,mode:'normal'}}],nextCursor:1});
  await store.saveDraft({...await store.getDraft(key),code:'离线版本'});
  await store.syncPullPage({changes:[{kind:'draft',id:'sum--python',problemId:'sum',language:'python',revision:2,payload:{...draft,code:'云端版本',mode:'normal'}}],nextCursor:2});
  const [conflict]=await store.syncConflicts();fail=true;await assert.rejects(store.syncCopyConflict(conflict.key),/disk full/);fail=false;
  assert.equal((await store.listRecords({kind:'problem'})).length,1);assert.equal((await store.syncConflicts()).length,1);assert.equal((await store.getDraft(key)).code,'离线版本');
  const copied=await store.syncCopyConflict(conflict.key);store=createLocalStore({dataDir,namespace:'account:a',sync:true});
  assert.equal((await store.getDraft({problemId:copied.problemId,language:'python'})).code,'离线版本');assert.equal((await store.getDraft(key)).code,'云端版本');assert.deepEqual(await store.syncConflicts(),[]);assert.ok(await store.syncPendingCount());
 }finally{await fs.rm(dataDir,{recursive:true,force:true});}
});

test('file sync quota metadata and pending runs survive restart while drafts can be staged',async()=>{
 const dataDir=await fs.mkdtemp(path.join(os.tmpdir(),'acmcoder-file-quota-'));
 try{
  let store=createLocalStore({dataDir,namespace:'account:a',sync:true});
  await store.syncPullPage({changes:[{kind:'problem',id:'sum',revision:1,payload:{title:'求和'}}],nextCursor:1});
  await store.putRecord({kind:'run',id:'pending-run',problemId:'sum',language:'python',payload:{stdout:'42'}});
  const [run]=await store.syncStage();assert.equal(run.kind,'run');
  await store.setMeta('sync:dailyRunRetryAt',Date.parse('2026-10-02T00:00:00Z'));
  await store.saveDraft(draft);store=createLocalStore({dataDir,namespace:'account:a',sync:true});
  assert.equal(await store.getMeta('sync:dailyRunRetryAt'),Date.parse('2026-10-02T00:00:00Z'));
  const [next]=await store.syncStage({skipNewRuns:true});assert.equal(next.kind,'draft');
  await store.syncAcknowledge({applied:[{mutationId:next.mutationId,revision:1}],conflicts:[],errors:[]});
  assert.deepEqual((await store.syncStage())[0],run);
  assert.equal((await store.exportBackup()).records.find(r=>r.kind==='run').payload.stdout,'42');
 }finally{await fs.rm(dataDir,{recursive:true,force:true});}
});
