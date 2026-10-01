import test from 'node:test';
import assert from 'node:assert/strict';
import {IDBFactory} from 'fake-indexeddb';
import {createBrowserStore} from '../shared/browser-store.js';
import {createAIClient,createChatTransport} from '../shared/ai.js';

const provider={baseUrl:'https://provider.test/v1',model:'model'};
const store=()=>createBrowserStore({namespace:'guest',indexedDB:new IDBFactory(),storage:null});
test('free questions persist to their captured problem and retries do not duplicate',async()=>{
 const db=store();await db.putRecord({kind:'problem',id:'one',payload:{title:'one'}});let calls=0,release;
 const client=createAIClient({store:db,credentials:{get:()=> 'test-only-key'},transport:async input=>{calls++;assert.equal(input.messages.at(-1).content,'直接给完整答案');await new Promise(r=>release=r);return {message:'自由回答'};}});
 const input={requestId:'request-one',problemId:'one',language:'python',provider,question:'直接给完整答案'};
 const pending=client.chat(input);while(!release)await new Promise(r=>setImmediate(r));release();await pending;await client.chat(input);assert.equal(calls,1);
 const record=await db.getRecord({kind:'conversation',id:'one--python'});assert.equal(record.problemId,'one');assert.deepEqual(record.payload.messages.map(m=>m.content),['直接给完整答案','自由回答']);
});
test('context truncation retains all saved history and key echoes are redacted',async()=>{
 const db=store();await db.putRecord({kind:'problem',id:'one',payload:{title:'one'}});let sent;
 const client=createAIClient({store:db,credentials:{get:()=> 'test-only-key'},transport:async input=>{sent=input.messages;return {message:'test-only-key'};}});
 const messages=Array.from({length:40},(_,i)=>({role:i%2?'assistant':'user',content:'x'.repeat(2000),requestId:`old-${i}`}));await db.putRecord({kind:'conversation',id:'one--python',problemId:'one',language:'python',payload:{messages}});
 await client.chat({requestId:'new',problemId:'one',language:'python',provider,question:'hi'});assert.ok(sent.length<40);const saved=await db.getRecord({kind:'conversation',id:'one--python'});assert.equal(saved.payload.messages.length,42);assert.equal(saved.payload.messages.at(-1).content,'[密钥已隐藏]');assert.ok(!JSON.stringify(await db.exportBackup()).includes('test-only-key'));
});
test('no key never calls a shared model; cancellation keeps the question and enables retry',async()=>{
 const db=store();await db.putRecord({kind:'problem',id:'one',payload:{title:'one'}});let key=null,calls=0;
 const client=createAIClient({store:db,credentials:{get:()=>key},transport:async ({signal})=>{calls++;await new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(new DOMException('Aborted','AbortError')),{once:true}));}});
 const input={requestId:'cancel',problemId:'one',language:'python',provider,question:'hi'};await assert.rejects(client.chat(input),/配置.*密钥/);assert.equal(calls,0);key='test-only-key';const pending=client.chat(input);while(!calls)await new Promise(r=>setImmediate(r));client.cancel('cancel');await assert.rejects(pending,/取消/);assert.equal((await db.getRecord({kind:'conversation',id:'one--python'})).payload.messages.length,1);
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
 const first=client.chat({requestId:'first',problemId:'one',language:'python',provider,question:'hi'});while(!release)await new Promise(r=>setImmediate(r));await db.setMeta('location',{problemId:'two'});release();await first;assert.equal((await db.getRecord({kind:'conversation',id:'one--python'})).payload.messages.length,2);assert.equal(await db.getRecord({kind:'conversation',id:'two--python'}),null);
 release=null;const second=client.chat({requestId:'second',problemId:'two',language:'python',provider,question:'hi'});while(!release)await new Promise(r=>setImmediate(r));key=null;client.cancelAll();release();await assert.rejects(second,/取消/);assert.equal((await db.getRecord({kind:'conversation',id:'two--python'})).payload.messages.length,1);
});
