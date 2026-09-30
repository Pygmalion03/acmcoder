import test from 'node:test';import assert from 'node:assert/strict';
import fs from 'node:fs/promises';import os from 'node:os';import path from 'node:path';
import {createUnifiedApi} from '../src/server/unified-api.js';
import {createAcmcoderServer} from '../src/server/server.js';
import {createLocalStore} from '../src/server/unified-store.js';
import {migrateLegacyProgress} from '../src/server/legacy-progress.js';

test('progress upgrade runs after the earlier page migration and retains counts through restart and full backup restore',async()=>{
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'acmcoder-progress-upgrade-'));
  try{
    const dataDir=path.join(directory,'learning'),progressFile=path.join(directory,'progress.json');
    const store=createLocalStore({dataDir});
    await store.putRecord({kind:'problem',id:'legacy-page-0',payload:{title:'两数之和',legacySlug:'two-sum'}});
    await store.setMeta('legacy-file-migrated',true);
    const original=JSON.stringify({version:1,items:{'memory:two-sum':{acCount:123,lastAcceptedAt:'2026-09-29T08:00:00Z'}}});await fs.writeFile(progressFile,original);
    const options={dataDir,credentialDir:path.join(directory,'credentials'),progressFile};
    const request={namespace:'local-guest',method:'exportBackup',args:[]};
    const backup=await createUnifiedApi(options).handle('store',request);
    const progress=backup.records.find(r=>r.kind==='progress');assert.ok(progress,'legacy AC count must be included in the unified backup');
    assert.equal(progress.problemId,'legacy-page-0');assert.equal(progress.payload.successes,123);assert.equal(progress.payload.legacyProgress.lastAcceptedAt,'2026-09-29T08:00:00Z');
    assert.equal(await fs.readFile(progressFile,'utf8'),original);
    const restarted=await createUnifiedApi(options).handle('store',request);assert.deepEqual(restarted.records,backup.records);
    const restored=createLocalStore({dataDir:path.join(directory,'restored')});await restored.restoreBackup(backup);
    assert.equal((await restored.listRecords({kind:'progress'}))[0].payload.successes,123);
  }finally{await fs.rm(directory,{recursive:true,force:true});}
});
test('legacy progress keeps more than 100 questions and never resurrects a deleted migrated question',async()=>{
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'acmcoder-progress-retain-'));
  try{
    const dataDir=path.join(directory,'learning'),progressFile=path.join(directory,'progress.json'),memoryFile=path.join(directory,'pages.jsonl');
    const store=createLocalStore({dataDir}),items=Object.fromEntries(Array.from({length:106},(_,i)=>[`old-${i}`,{acCount:i+1,lastAcceptedAt:'2020-01-01T00:00:00Z'}]));
    await fs.writeFile(memoryFile,JSON.stringify({slug:'deleted',content:'原题'})+'\n');
    await store.putRecord({kind:'problem',id:'legacy-page-0',payload:{title:'已删除',legacySlug:'deleted'}});await store.deleteProblem('legacy-page-0',{confirmed:true});
    items.deleted={acCount:50,lastAcceptedAt:'2020-01-01T00:00:00Z'};await fs.writeFile(progressFile,JSON.stringify({version:1,items}));
    await migrateLegacyProgress({store,dataDir,progressFile,memoryFile});
    assert.equal((await store.listRecords({kind:'progress'})).length,106);assert.equal((await store.listRecords({kind:'problem'})).length,106);
    assert.equal((await store.exportBackup()).records.filter(r=>r.kind==='progress').length,106);assert.equal((await store.getMeta('legacy-progress-migrated-v1')).skippedDeleted,1);
    assert.equal(await store.getRecord({kind:'problem',id:'legacy-page-0'}),null);
  }finally{await fs.rm(directory,{recursive:true,force:true});}
});
test('an interrupted progress migration retries without duplicates or overwriting newer data',async()=>{
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'acmcoder-progress-retry-'));
  try{
    const dataDir=path.join(directory,'learning'),progressFile=path.join(directory,'progress.json');await fs.writeFile(progressFile,JSON.stringify({version:1,items:{'two-sum':{acCount:7,lastAcceptedAt:'2026-09-29T08:00:00Z'}}}));
    const store=createLocalStore({dataDir});let interrupted=true;
    const wrapped={...store,setMeta:async(...args)=>{if(interrupted&&args[0]==='legacy-progress-migrated-v1'){interrupted=false;throw new Error('simulated interruption');}return store.setMeta(...args);}};
    await assert.rejects(migrateLegacyProgress({store:wrapped,dataDir,progressFile}),/simulated interruption/);
    assert.equal(await store.getMeta('legacy-progress-migrated-v1'),undefined);assert.equal((await store.listRecords({kind:'progress'})).length,1);
    const restarted=createLocalStore({dataDir});await migrateLegacyProgress({store:restarted,dataDir,progressFile});
    const rows=await restarted.listRecords({kind:'progress'});assert.equal(rows.length,1);assert.equal(rows[0].payload.successes,7);assert.deepEqual(await restarted.getMeta('backup:pending'),[]);
    await restarted.putRecord({...rows[0],payload:{...rows[0].payload,successes:12}});
    await migrateLegacyProgress({store:createLocalStore({dataDir}),dataDir,progressFile});
    assert.equal((await createLocalStore({dataDir}).listRecords({kind:'progress'}))[0].payload.successes,12);
  }finally{await fs.rm(directory,{recursive:true,force:true});}
});
test('legacy file migration preserves originals, runs once and cannot expose credentials or another account',async()=>{
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'acmcoder-migrate-'));
  try{
    const memoryFile=path.join(directory,'pages.jsonl'),raw=JSON.stringify({slug:'two-sum',title:'两数之和',content:'<p>原题面</p>',url:'https://leetcode.cn/problems/two-sum/',apiKey:'must-not-export'})+'\n';await fs.writeFile(memoryFile,raw);
    const api=createUnifiedApi({dataDir:path.join(directory,'learning'),credentialDir:path.join(directory,'credentials'),memoryFile});
    const session=await api.handle('session');assert.equal(session.namespace,'local-guest');const args={namespace:'local-guest',method:'exportBackup',args:[]};
    const backup=await api.handle('store',args);assert.equal(backup.records.length,1);assert.equal(JSON.stringify(backup).includes('must-not-export'),false);assert.equal(await fs.readFile(memoryFile,'utf8'),raw);assert.equal(await fs.readFile(path.join(directory,'learning/legacy-originals/pages.jsonl'),'utf8'),raw);
    assert.equal((await api.handle('store',args)).records.length,1);await assert.rejects(api.handle('store',{...args,namespace:'account:b'}),e=>e.code==='account_changed');
    await assert.rejects(api.handle('store',{...args,method:'constructor'}),/INVALID_STORE_METHOD/);
  }finally{await fs.rm(directory,{recursive:true,force:true});}
});
test('HTTP unified writes require local session token; the server serves shared code and keeps legacy entry',async()=>{
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'acmcoder-local-http-'));const server=createAcmcoderServer({unifiedDataDir:path.join(directory,'learning'),credentialDir:path.join(directory,'credentials'),memoryFile:path.join(directory,'pages.jsonl')});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin=`http://127.0.0.1:${server.address().port}`;
  try{
    assert.match(await fetch(origin).then(r=>r.text()),/workspace\.js/);assert.equal((await fetch(`${origin}/shared/practice.js`)).status,200);assert.match(await fetch(`${origin}/legacy.html`).then(r=>r.text()),/app\.js/);
    const mutation={namespace:'local-guest',method:'putRecord',args:[{kind:'problem',id:'p',payload:{title:'题目'}}]};
    assert.equal((await fetch(`${origin}/api/unified/store`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(mutation)})).status,401);
    const token=await fetch(`${origin}/api/session`).then(r=>r.json()).then(r=>r.token);
    assert.equal((await fetch(`${origin}/api/unified/store`,{method:'POST',headers:{'content-type':'application/json','x-acmcoder-token':token},body:JSON.stringify(mutation)})).status,200);
  }finally{await new Promise(resolve=>server.close(resolve));await fs.rm(directory,{recursive:true,force:true});}
});
