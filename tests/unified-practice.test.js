import test from 'node:test';
import assert from 'node:assert/strict';
import { IDBFactory } from 'fake-indexeddb';
import { createBrowserStore } from '../shared/browser-store.js';

function setup() {
  const indexedDB = new IDBFactory();
  const entries = new Map();
  const storage = { getItem:key=>entries.get(key) ?? null,setItem:(key,value)=>entries.set(key,value),removeItem:key=>entries.delete(key) };
  return { indexedDB,storage,store:createBrowserStore({namespace:'guest',indexedDB,storage}) };
}
const original = { problemId:'sum',language:'python',code:'print("原代码")',stdin:'中文输入',expected:'答案',mode:'normal',previousAttemptId:null };

test('draft survives reopening, languages and accounts remain separate', async () => {
  const {store,indexedDB,storage}=setup();
  await store.saveDraft(original);
  await store.saveDraft({...original,language:'cpp',code:'int main() {}'});
  const reopened=createBrowserStore({namespace:'guest',indexedDB,storage});
  assert.equal((await reopened.getDraft(original)).code,original.code);
  assert.equal((await reopened.getDraft({...original,language:'cpp'})).code,'int main() {}');
  const other=createBrowserStore({namespace:'account-b',indexedDB,storage});
  assert.equal(await other.getDraft(original),null);
});

test('rewrite keeps old input, survives reopen, finishes once and preserves both snapshots', async () => {
  const {store,indexedDB,storage}=setup();
  await store.saveDraft(original);
  const rewrite=await store.startRewrite({...original,template:'import sys\n'});
  assert.equal(rewrite.code,'import sys\n');
  assert.equal(rewrite.stdin,'中文输入');
  assert.equal((await store.listAttempts(original)).items[0].code,original.code);
  const reopened=createBrowserStore({namespace:'guest',indexedDB,storage});
  assert.equal((await reopened.getDraft(original)).mode,'rewrite');
  await reopened.saveDraft({...rewrite,code:'print("重写")'});
  await reopened.finishRewrite(original);
  await reopened.finishRewrite(original);
  assert.equal((await reopened.listAttempts(original)).items.length,2);
  assert.equal((await reopened.getDraft(original)).code,'print("重写")');
});

test('discard removes only unfinished rewrite, failed transaction leaves original untouched', async () => {
  const {store}=setup();
  await store.saveDraft(original);
  await assert.rejects(store.startRewrite({...original,template:42}));
  assert.equal((await store.getDraft(original)).code,original.code);
  assert.equal((await store.listAttempts(original)).items.length,0);
  await store.startRewrite({...original,template:''});
  await store.discardRewrite(original);
  assert.equal((await store.getDraft(original)).code,original.code);
  assert.equal((await store.listAttempts(original)).items.length,1);
});

test('queued edits keep their original problem and latest input survives immediate reopen', async () => {
  const {store,indexedDB,storage}=setup();
  const a=store.saveDraft({...original,code:'first'});
  const b=store.saveDraft({...original,code:'last 中文'});
  const c=store.saveDraft({...original,problemId:'free',code:'other problem'});
  await Promise.all([a,b,c]);
  const reopened=createBrowserStore({namespace:'guest',indexedDB,storage});
  assert.equal((await reopened.getDraft(original)).code,'last 中文');
  assert.equal((await reopened.getDraft({...original,problemId:'free'})).code,'other problem');
  assert.equal(store.getSaveState().state,'saved');
});

test('write-ahead recovery is consumed once and storage errors never report saved',async()=>{
  const {indexedDB,storage}=setup();
  storage.setItem('acmcoder-v3-recovery:recover',JSON.stringify([{...original,id:'sum--python',code:'last uncommitted edit'}]));
  const recovered=createBrowserStore({namespace:'recover',indexedDB,storage});
  assert.equal((await recovered.getDraft(original)).code,'last uncommitted edit');
  assert.equal(storage.getItem('acmcoder-v3-recovery:recover'),null);
  const broken=createBrowserStore({namespace:'broken',indexedDB,storage:{getItem:()=>null,setItem(){throw new Error('QuotaExceededError');}}});
  await assert.rejects(broken.saveDraft(original),/QuotaExceeded/);
  assert.equal(broken.getSaveState().state,'error');
});
