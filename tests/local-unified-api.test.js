import test from 'node:test';import assert from 'node:assert/strict';
import fs from 'node:fs/promises';import os from 'node:os';import path from 'node:path';
import {createUnifiedApi} from '../src/server/unified-api.js';
import {createAcmcoderServer} from '../src/server/server.js';
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
