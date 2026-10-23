import test from 'node:test';
import assert from 'node:assert/strict';
import {IDBFactory} from 'fake-indexeddb';
import {createBrowserStore} from '../shared/browser-store.js';
import {createAIClient,createChatTransport} from '../shared/ai.js';
import {readConversationPage,conversationTurnId} from '../shared/conversations.js';

const provider={baseUrl:'https://provider.test/v1',model:'model'};
const store=()=>createBrowserStore({namespace:'guest',indexedDB:new IDBFactory(),storage:null});
async function history(db,problemId='one'){
 const messages=[];let cursor=null;
 do{const page=await readConversationPage(db,{problemId,language:'python',cursor});messages.unshift(...page.messages);cursor=page.nextCursor;}while(cursor);
 return messages;
}
test('free questions persist to their captured problem and retries do not duplicate',async()=>{
 const db=store();await db.putRecord({kind:'problem',id:'one',payload:{title:'one'}});let calls=0,release;
 const client=createAIClient({store:db,credentials:{get:()=> 'test-only-key'},transport:async input=>{calls++;assert.equal(input.messages.at(-1).content,'直接给完整答案');await new Promise(r=>release=r);return {message:'自由回答'};}});
 const input={requestId:'request-one',problemId:'one',language:'python',provider,question:'直接给完整答案'};
 const pending=client.chat(input);while(!release)await new Promise(r=>setImmediate(r));release();await pending;await client.chat(input);assert.equal(calls,1);
 const record=(await db.listRecords({kind:'conversation'}))[0];assert.equal(record.problemId,'one');assert.deepEqual((await history(db)).map(m=>m.content),['直接给完整答案','自由回答']);
});
test('context truncation retains all saved history and key echoes are redacted',async()=>{
 const db=store();await db.putRecord({kind:'problem',id:'one',payload:{title:'one'}});let sent;
 const client=createAIClient({store:db,credentials:{get:()=> 'test-only-key'},transport:async input=>{sent=input.messages;return {message:'test-only-key'};}});
 const messages=Array.from({length:40},(_,i)=>({role:i%2?'assistant':'user',content:'x'.repeat(2000),requestId:`old-${i}`}));await db.putRecord({kind:'conversation',id:'one--python',problemId:'one',language:'python',payload:{messages}});
 await client.chat({requestId:'new',problemId:'one',language:'python',provider,question:'hi'});assert.ok(sent.length<40);const saved=await history(db);assert.equal(saved.length,42);assert.equal(saved.at(-1).content,'[密钥已隐藏]');assert.ok(!JSON.stringify(await db.exportBackup()).includes('test-only-key'));
});
test('no key never calls a shared model; cancellation keeps the question and enables retry',async()=>{
 const db=store();await db.putRecord({kind:'problem',id:'one',payload:{title:'one'}});let key=null,calls=0;
 const client=createAIClient({store:db,credentials:{get:()=>key},transport:async ({signal})=>{calls++;await new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(new DOMException('Aborted','AbortError')),{once:true}));}});
 const input={requestId:'cancel',problemId:'one',language:'python',provider,question:'hi'};await assert.rejects(client.chat(input),/配置.*密钥/);assert.equal(calls,0);key='test-only-key';const pending=client.chat(input);while(!calls)await new Promise(r=>setImmediate(r));client.cancel('cancel');await assert.rejects(pending,/取消/);assert.equal((await history(db)).length,1);
});
test('transport rejects redirects and unsafe URLs and does not expose provider errors',async()=>{
 let requested;const transport=createChatTransport({fetch:async (url,options)=>{requested={url,options};return new Response(JSON.stringify({error:{message:'secret-key'}}),{status:401});}});
 await assert.rejects(transport({provider,key:'secret-key',messages:[{role:'user',content:'hi'}]}),/401/);assert.equal(requested.options.redirect,'manual');assert.equal(requested.url,'https://provider.test/v1/chat/completions');
 for(const baseUrl of ['http://evil.test/v1','https://user:pass@provider.test/v1','https://provider.test/v1?key=secret'])await assert.rejects(transport({provider:{...provider,baseUrl},key:'secret-key',messages:[]}),/API 地址/);
});
test('manual redirects never send the key to the redirect target',async()=>{
 for(const response of [new Response(null,{status:302,headers:{location:'https://another-provider.test/v1'}}),{status:0,type:'opaqueredirect'}]){
  let calls=0;
  const transport=createChatTransport({fetch:async(url,options)=>{
   calls++;assert.equal(url,'https://provider.test/v1/chat/completions');assert.equal(options.redirect,'manual');return response;
  }});
  await assert.rejects(transport({provider,key:'test-only-key',messages:[{role:'user',content:'hi'}]}),/重定向/);
  assert.equal(calls,1);
 }
});

test('switching problems does not redirect an answer and clearing credentials cancels persistence',async()=>{
 const db=store();for(const id of ['one','two'])await db.putRecord({kind:'problem',id,payload:{title:id}});let release,key='test-only-key';
 const client=createAIClient({store:db,credentials:{get:()=>key},transport:async()=>{await new Promise(r=>release=r);return {message:'answer'};}});
 const first=client.chat({requestId:'first',problemId:'one',language:'python',provider,question:'hi'});while(!release)await new Promise(r=>setImmediate(r));await db.setMeta('location',{problemId:'two'});release();await first;assert.equal((await history(db)).length,2);assert.equal((await history(db,'two')).length,0);
 release=null;const second=client.chat({requestId:'second',problemId:'two',language:'python',provider,question:'hi'});while(!release)await new Promise(r=>setImmediate(r));key=null;client.cancelAll();release();await assert.rejects(second,/取消/);assert.equal((await history(db,'two')).length,1);
});

test('long conversations grow beyond one record without rewriting legacy history and restore completely',async()=>{
 const db=store();await db.putRecord({kind:'problem',id:'one',payload:{title:'one'}});
 const messages=Array.from({length:100},(_,i)=>({role:i%2?'assistant':'user',content:`旧记录${i}：`+'旧'.repeat(3000),requestId:`old-${i}`}));
 const legacy=await db.putRecord({kind:'conversation',id:'one--python',problemId:'one',language:'python',payload:{messages}});
 let calls=0;
 const client=createAIClient({store:db,credentials:{get:()=> 'test-only-key'},transport:async()=>{calls++;return {message:'新'.repeat(90000)};}});
 for(let i=0;i<5;i++)await client.chat({requestId:`large-${i}`,problemId:'one',language:'python',provider,question:`继续${i}`});
 assert.equal(calls,5);assert.deepEqual(await db.getRecord({kind:'conversation',id:'one--python'}),legacy);
 const backup=await db.exportBackup();assert.ok(new TextEncoder().encode(JSON.stringify(backup)).length>2*1024*1024);
 const restored=store();await restored.restoreBackup(backup);
 assert.deepEqual(await history(restored),await history(db));assert.equal((await history(restored)).length,110);
 await restored.restoreBackup(backup);assert.equal((await history(restored)).length,110);
});

test('retrying a failed answer save reuses the answer without paying for another request',async()=>{
 const db=store();await db.putRecord({kind:'problem',id:'one',payload:{title:'one'}});let fail=true,calls=0;
 const wrapped={...db,putRecord:async record=>{if(fail&&record.payload.messages?.some(m=>m.role==='assistant'))throw new Error('disk full');return db.putRecord(record);}};
 const client=createAIClient({store:wrapped,credentials:{get:()=> 'test-only-key'},transport:async()=>{calls++;return {message:'保留的回答'};}});
 const input={requestId:'retry-save',problemId:'one',language:'python',provider,question:'保存测试'};
 await assert.rejects(client.chat(input),/只重试保存/);assert.equal((await history(db)).length,1);
 fail=false;assert.equal((await client.chat(input)).message,'保留的回答');assert.equal(calls,1);assert.equal((await history(db)).length,2);
 await client.chat(input);assert.equal(calls,1);
});

test('an old pending question can receive a new answer without duplicating the original question',async()=>{
 const db=store();await db.putRecord({kind:'problem',id:'one',payload:{title:'one'}});
 await db.putRecord({kind:'conversation',id:'one--python',problemId:'one',language:'python',payload:{messages:[{role:'user',content:'旧问题',requestId:'old-pending'}]}});
 const client=createAIClient({store:db,credentials:{get:()=> 'test-only-key'},transport:async input=>{assert.equal(input.messages.at(-1).content,'旧问题');return {message:'新回答'};}});
 await client.chat({requestId:'old-pending',problemId:'one',language:'python',provider,question:'旧问题'});
 assert.deepEqual((await history(db)).map(m=>m.content),['旧问题','新回答']);
});

test('turn IDs are scoped to problem and language and fit the record ID limit',async()=>{
 const key={problemId:'p'.repeat(100),language:'python',requestId:'r'.repeat(100)};
 const id=await conversationTurnId(key);assert.ok(id.length<=100);assert.equal(await conversationTurnId(key),id);
 assert.notEqual(await conversationTurnId({...key,language:'java'}),id);
 assert.notEqual(await conversationTurnId({...key,problemId:'other'}),id);
});

test('legacy imports with arbitrary IDs remain readable through pagination and recovery copies',async()=>{
 const db=store();await db.putRecord({kind:'problem',id:'one',payload:{title:'one'}});
 await db.putRecord({kind:'conversation',id:'one--python',problemId:'one',language:'python',updatedAt:1,payload:{messages:[{role:'user',content:'最早的对话'}]}});
 const imported=Array.from({length:45},(_,i)=>({role:i%2?'assistant':'user',content:`导入的历史 ${i}`}));
 await db.putRecord({kind:'conversation',id:'legacy-random-id',problemId:'one',language:'python',updatedAt:2,payload:{messages:imported}});
 assert.deepEqual((await history(db)).map(m=>m.content),['最早的对话',...imported.map(m=>m.content)]);
 const backup=await db.exportBackup();backup.records.find(r=>r.kind==='problem').payload.title='恢复版本';
 await db.restoreBackup(backup);const [pending]=await db.getMeta('backup:pending');
 const {problemIds:[copy]}=await db.backupCopyConflict(pending.id);
 assert.deepEqual((await history(db,copy)).map(m=>m.content).sort(),(await history(db)).map(m=>m.content).sort());
});
