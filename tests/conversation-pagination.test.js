import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {IDBFactory} from 'fake-indexeddb';
import {createBrowserStore} from '../shared/browser-store.js';
import {createLocalStore} from '../src/server/unified-store.js';
import {createAcmcoderServer} from '../src/server/server.js';

const key={problemId:'sum',language:'python'};
const turn=(id,startedAt,extra={})=>({kind:'conversation',id,...key,...extra,payload:{format:'turn-v1',startedAt,messages:[{role:'user',content:id,requestId:`request-${id}`}]}});

for(const adapter of ['browser','file'])test(`${adapter} conversation pages isolate a thread and keep a stable cursor after insertion and deletion`,async t=>{
  const dataDir=adapter==='file'?await fs.mkdtemp(path.join(os.tmpdir(),'acmcoder-turn-pages-')):null;
  if(dataDir)t.after(()=>fs.rm(dataDir,{recursive:true,force:true}));
  const store=adapter==='file'?createLocalStore({dataDir}):createBrowserStore({namespace:'turn-pages',indexedDB:new IDBFactory(),storage:null});
  for(const record of [turn('oldest',10),turn('tie-a',20),turn('tie-z',20),turn('newest',30),turn('other-language',40,{language:'cpp'}),turn('other-problem',50,{problemId:'other'}),{kind:'conversation',id:'sum--python',...key,payload:{messages:[{role:'user',content:'legacy root'}]}}])await store.putRecord(record);
  const first=await store.listConversationTurns({...key,limit:2});
  assert.deepEqual(first.items.map(item=>item.id),['newest','tie-z']);assert.deepEqual(first.nextCursor,{startedAt:20,id:'tie-z'});
  await store.putRecord(turn('arrived-after-first-page',25));
  await store.syncPullPage({changes:[{kind:'conversation',id:'tie-z',revision:2,deleted:true}],nextCursor:1});
  const second=await store.listConversationTurns({...key,limit:2,cursor:first.nextCursor});
  assert.deepEqual(second.items.map(item=>item.id),['tie-a','oldest']);assert.equal(second.nextCursor,null);
  assert.deepEqual((await store.listConversationTurns({...key,problemId:'missing'})).items,[]);
});

test('local HTTP conversation pagination returns only the requested page and caps excessive limits',async()=>{
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'acmcoder-turn-http-')),dataDir=path.join(directory,'learning');
  const store=createLocalStore({dataDir});
  const records=[{kind:'problem',id:'sum',payload:{title:'Sum'}},...Array.from({length:60},(_,index)=>({
    ...turn(`turn-${String(index).padStart(3,'0')}`,index),payload:{format:'turn-v1',startedAt:index,messages:[{role:'user',content:`turn-${index}:`+'x'.repeat(4096),requestId:`request-${index}`}]}
  }))];
  await store.restoreBackup({version:3,records});
  const server=createAcmcoderServer({unifiedDataDir:dataDir,credentialDir:path.join(directory,'credentials'),memoryFile:path.join(directory,'missing-pages.jsonl'),progressFile:path.join(directory,'missing-progress.json')});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin=`http://127.0.0.1:${server.address().port}`;
  try{
    const token=await fetch(`${origin}/api/session`).then(response=>response.json()).then(result=>result.token);
    const request=async args=>{
      const response=await fetch(`${origin}/api/unified/store`,{method:'POST',headers:{'content-type':'application/json','x-acmcoder-token':token},body:JSON.stringify({namespace:'local-guest',method:'listConversationTurns',args:[args]})});
      assert.equal(response.status,200);return response.text();
    };
    const body=await request(key),page=JSON.parse(body).result;
    assert.equal(page.items.length,10);assert.equal(page.items[0].id,'turn-059');assert.equal(page.items.at(-1).id,'turn-050');
    assert.ok(body.length<50000,'the response contains only ten turns, not the full 250KB conversation');assert.ok(!body.includes('turn-0:'));
    const second=JSON.parse(await request({...key,cursor:page.nextCursor})).result;
    assert.equal(second.items[0].id,'turn-049');assert.equal(second.items.length,10);
    assert.equal(JSON.parse(await request({...key,limit:10000})).result.items.length,50);
  }finally{await new Promise(resolve=>server.close(resolve));await fs.rm(directory,{recursive:true,force:true});}
});
