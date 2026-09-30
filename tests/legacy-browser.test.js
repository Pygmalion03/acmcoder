import test from 'node:test';
import assert from 'node:assert/strict';
import {IDBFactory} from 'fake-indexeddb';
import {createBrowserStore} from '../shared/browser-store.js';
import {migrateBrowserDrafts} from '../shared/legacy-browser.js';
test('legacy device drafts migrate without reading another account or removing originals',async()=>{
  const entries=new Map([['acmcoder-free-draft-v1:free',JSON.stringify({code:'guest',stdin:'中',expected:''})],['acmcoder-free-draft-v2:someone:sum',JSON.stringify({code:'private'})]]);
  const storage={get length(){return entries.size;},key:i=>[...entries.keys()][i],getItem:key=>entries.get(key)||null};
  const store=createBrowserStore({namespace:'guest',indexedDB:new IDBFactory(),storage:null});
  await migrateBrowserDrafts({store,namespace:'guest',storage});
  assert.equal((await store.getDraft({problemId:'free',language:'python'})).code,'guest');
  assert.equal(await store.getDraft({problemId:'sum',language:'python'}),null);
  assert.equal(entries.size,2);
  await migrateBrowserDrafts({store,namespace:'guest',storage});
  assert.equal((await store.listRecords({kind:'problem'})).length,1);
});
