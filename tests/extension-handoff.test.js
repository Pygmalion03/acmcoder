import test from 'node:test';
import assert from 'node:assert/strict';
import {IDBFactory} from 'fake-indexeddb';
import {createBrowserStore} from '../shared/browser-store.js';
import {createHandoffVault,prepareHandoffImport,validateHandoff} from '../shared/handoff.js';
const records=[{kind:'problem',id:'sum',payload:{title:'求和'}},{kind:'draft',id:'sum--python',problemId:'sum',language:'python',payload:{code:'原代码',stdin:'输入',expected:'输出',mode:'normal',previousAttemptId:null}}];
function setup(){let now=1;const entries=new Map();const storage={set:async values=>{for(const [k,v]of Object.entries(values))entries.set(k,v);},get:async names=>Object.fromEntries(names.map(n=>[n,entries.get(n)])),remove:async name=>entries.delete(name)};return {vault:createHandoffVault({storage,clock:()=>now}),expire:()=>now+=300001};}
test('handoff binds exact origin and destination tab; concurrent consumption succeeds once',async()=>{
 const {vault}=setup();const envelope=await vault.create({records,source:'extension',targetOrigin:'https://target.example',targetTabId:7});assert.match(envelope.nonce,/^[a-f0-9]{32}$/);
 await assert.rejects(vault.consume({...envelope,targetOrigin:'https://evil.example',targetTabId:7}),/不匹配/);await assert.rejects(vault.consume({...envelope,targetOrigin:'https://target.example',targetTabId:8}),/不匹配/);
 const outcomes=await Promise.allSettled([1,2].map(()=>vault.consume({...envelope,targetOrigin:'https://target.example',targetTabId:7})));assert.equal(outcomes.filter(r=>r.status==='fulfilled').length,1);assert.equal(outcomes[0].value.records[1].payload.code,'原代码');
});
test('expired transfer is removed; credentials and unrelated records cannot be requested',async()=>{
 const {vault,expire}=setup();const envelope=await vault.create({records,source:'extension',targetOrigin:'https://target.example',targetTabId:7});expire();await assert.rejects(vault.consume({...envelope,targetOrigin:'https://target.example',targetTabId:7}),/过期/);await assert.rejects(vault.consume({...envelope,targetOrigin:'https://target.example',targetTabId:7}),/已使用或失效/);
 assert.throws(()=>validateHandoff([...records,{kind:'settings',id:'settings',payload:{apiKey:'secret'}}]),/CREDENTIAL/);assert.throws(()=>validateHandoff([...records,{kind:'problem',id:'another',payload:{title:'另题'}}]),/只允许/);
});
test('handoff conflict creates linked rewrite copy and leaves both original drafts untouched',async()=>{
 const store=createBrowserStore({namespace:'guest',indexedDB:new IDBFactory(),storage:null});await store.putRecord(records[0]);await store.saveDraft({problemId:'sum',language:'python',code:'本地版本',stdin:'',expected:''});
 const snapshot={kind:'attempt',id:'before',problemId:'sum',language:'python',payload:{code:'历史',stdin:'',expected:'',reason:'before-rewrite',createdAt:1}};
 const incoming=[records[0],snapshot,{...records[1],payload:{...records[1].payload,mode:'rewrite',previousAttemptId:'before'}}];
 const plan=await prepareHandoffImport({store,records:incoming});assert.equal(plan.copy,true);assert.notEqual(plan.problemId,'sum');
 await store.restoreBackup({version:3,records:plan.records});const copied=await store.getDraft({problemId:plan.problemId,language:'python'});assert.equal(copied.code,'原代码');assert.equal((await store.listAttempts({problemId:plan.problemId})).items[0].id,copied.previousAttemptId);assert.equal((await store.getDraft({problemId:'sum',language:'python'})).code,'本地版本');
});
