import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createAcmcoderServer} from '../src/server/server.js';
import {createAIClient} from '../shared/ai.js';
import {readConversationPage} from '../shared/conversations.js';

test('long chat and all linked learning records survive real HTTP writes, service restart and restoration to a fresh directory',async()=>{
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'acmcoder-conversation-recovery-'));
 const servers=[];
 async function open(name){
  const root=path.join(directory,name);
  const server=createAcmcoderServer({unifiedDataDir:path.join(root,'learning'),credentialDir:path.join(root,'credentials'),memoryFile:path.join(root,'pages.jsonl'),progressFile:path.join(root,'progress.json')});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));servers.push(server);
  const origin=`http://127.0.0.1:${server.address().port}`;
  const {token}=await fetch(`${origin}/api/session`).then(response=>response.json());
  async function call(method,...args){
   const response=await fetch(`${origin}/api/unified/store`,{method:'POST',headers:{'content-type':'application/json','x-acmcoder-token':token},body:JSON.stringify({namespace:'local-guest',method,args})});
   const body=await response.json();assert.equal(response.status,200,body.error);return body.result;
  }
  const store=Object.fromEntries(['getRecord','putRecord','getMeta','listConversationTurns'].map(method=>[method,(...args)=>call(method,...args)]));
  return {server,call,store};
 }
 const close=server=>new Promise(resolve=>server.close(resolve));
 try{
  const first=await open('original');
  await first.call('putRecord',{kind:'problem',id:'long-chat',payload:{title:'长期记录恢复验收',statement:'读取两个整数并输出和。',cases:[{stdin:'2 3',expected:'5'}]}});
  for(const language of ['python','cpp','java'])await first.call('saveDraft',{problemId:'long-chat',language,code:`${language} draft`,stdin:'2 3',expected:'5'});
  await first.call('startRewrite',{problemId:'long-chat',language:'python',template:'rewritten'});
  await first.call('finishRewrite',{problemId:'long-chat',language:'python'});
  await first.call('putRecord',{kind:'run',id:'saved-run',problemId:'long-chat',language:'python',payload:{code:'print(5)',stdin:'2 3',expected:'5',stdout:'5',status:'self_pass'}});
  await first.call('putRecord',{kind:'plan',id:'saved-plan',payload:{day:'2026-10-24',items:[{problemId:'long-chat',reason:'practice'}],completed:{'long-chat':true}}});
  await first.call('putRecord',{kind:'review',id:'saved-review',problemId:'long-chat',payload:{dueDay:'2026-10-25'}});
  const legacy={kind:'conversation',id:'long-chat--python',problemId:'long-chat',language:'python',payload:{messages:Array.from({length:80},(_,i)=>({role:i%2?'assistant':'user',content:`旧记录 ${i} `+'旧'.repeat(3000)}))}};
  await first.call('putRecord',legacy);
  // The synthetic provider isolates persistence acceptance from model billing.
  // Storage, HTTP, JSON limits, fsync, restart and restore all use real code.
  const client=createAIClient({store:first.store,credentials:{get:()=> 'test-only-provider-key'},transport:async()=>({message:'新'.repeat(90000)})});
  for(let i=0;i<6;i++)await client.chat({requestId:`turn-${i}`,problemId:'long-chat',language:'python',provider:{baseUrl:'https://provider.test',model:'storage-test'},question:`保存第 ${i} 轮`});
  const backup=await first.call('exportBackup');
  assert.ok(Buffer.byteLength(JSON.stringify(backup))>2*1024*1024);
  await close(first.server);
  const restarted=await open('original');
  assert.deepEqual((await restarted.call('exportBackup')).records,backup.records);
  const fresh=await open('fresh');
  const preview=await fresh.call('previewBackup',backup);assert.equal(preview.conflicts.length,0);
  await fresh.call('restoreBackup',backup);await fresh.call('restoreBackup',backup);
  const normalized=records=>records.toSorted((a,b)=>`${a.kind}:${a.id}`.localeCompare(`${b.kind}:${b.id}`));
  assert.deepEqual(normalized((await fresh.call('exportBackup')).records),normalized(backup.records));
  let cursor=null,total=0;
  do{const page=await readConversationPage(fresh.store,{problemId:'long-chat',language:'python',cursor});assert.ok(page.messages.length<=20);total+=page.messages.length;cursor=page.nextCursor;}while(cursor);
  assert.equal(total,92);
  assert.deepEqual((await fresh.call('getRecord',{kind:'conversation',id:legacy.id})).payload,legacy.payload);
 }finally{
  for(const server of servers)if(server.listening)await close(server);
  await fs.rm(directory,{recursive:true,force:true});
 }
});
