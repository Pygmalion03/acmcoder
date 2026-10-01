import test from 'node:test';
import assert from 'node:assert/strict';
import {IDBFactory} from 'fake-indexeddb';
import {createBrowserStore} from '../shared/browser-store.js';
import {mountWorkspace} from '../shared/ui/workspace.js';

// Exercise the actual UI handlers and persisted records. This DOM shell does
// not implement date arithmetic or plan selection; both come from workspace.js.
async function fixture(t,{timezone='Asia/Shanghai',instant='2026-10-01T16:00:00Z'}={}) {
  const entries=new Map();
  const storage={getItem:k=>entries.get(k)??null,setItem:(k,v)=>entries.set(k,v),removeItem:k=>entries.delete(k)};
  const store=createBrowserStore({namespace:'workspace-test',indexedDB:new IDBFactory(),storage});
  await store.putRecord({kind:'settings',id:'preferences',payload:{timezone,theme:'light',count:3}});
  const nodes=new Map(),handlers=new Map();
  const node=()=>({innerHTML:'',textContent:'',value:'',dataset:{},open:false,addEventListener(){},setAttribute(){},after(){},querySelector:()=>({after(){}})});
  const root={dataset:{},innerHTML:'',querySelectorAll:()=>[],querySelector(selector){if(!nodes.has(selector))nodes.set(selector,node());return nodes.get(selector);},addEventListener:(type,handler)=>handlers.set(type,handler)};
  t.mock.method(globalThis,'setTimeout',()=>0);
  t.mock.method(globalThis,'clearTimeout',()=>{});
  const priorDocument=globalThis.document,priorWindow=globalThis.window;
  globalThis.document={documentElement:{dataset:{}},createElement:node};
  globalThis.window={addEventListener(){},removeEventListener(){}};
  let time=new Date(instant);
  const app=await mountWorkspace(root,{store,runner:{cancel(){}},clock:()=>time});
  t.after(()=>{app.destroy();globalThis.document=priorDocument;globalThis.window=priorWindow;});
  return {store,app,root,content:()=>nodes.get('#content').innerHTML,setTime:value=>{time=new Date(value);},
    async click(action,id){
      assert.ok(root.innerHTML.includes(`data-action="${action}"`)||nodes.get('#content').innerHTML.includes(`data-action="${action}"`),`UI exposes ${action}`);
      await handlers.get('click')({target:{closest:()=>({dataset:{action,id}})}});
    },
    change:async(id,value)=>handlers.get('change')({target:{id,value}})};
}

for(const [timezone,instant,today,tomorrow] of [
  ['Asia/Shanghai','2026-10-01T15:59:59Z','2026-10-01','2026-10-02'],
  ['Asia/Shanghai','2026-10-01T16:00:00Z','2026-10-02','2026-10-03'],
  ['America/New_York','2026-03-08T06:30:00Z','2026-03-08','2026-03-09'],
  ['America/New_York','2026-03-08T07:30:00Z','2026-03-08','2026-03-09'],
  ['America/New_York','2026-11-01T05:30:00Z','2026-11-01','2026-11-02'],
  ['America/New_York','2026-11-01T06:30:00Z','2026-11-01','2026-11-02'],
  ['Europe/London','2026-12-31T23:59:59Z','2026-12-31','2027-01-01'],
]) test(`actual today and review UI: ${timezone} ${instant}`,async t=>{
  const f=await fixture(t,{timezone,instant});
  assert.ok(f.content().includes(`${today} · 按自己的节奏来`));
  await f.app.navigate('practice','sum');
  await f.click('review');
  assert.equal((await f.store.getRecord({kind:'review',id:'review-sum'})).payload.dueDay,tomorrow);
});

test('changing timezone affects today and tomorrow without changing stored draft',async t=>{
  const f=await fixture(t);
  const before=await f.store.getDraft({problemId:'sum',language:'python'});
  await f.change('timezone','America/Los_Angeles');
  assert.ok(f.content().includes('2026-10-01 · 按自己的节奏来'));
  await f.app.navigate('practice','sum');
  await f.click('review');
  assert.equal((await f.store.getRecord({kind:'review',id:'review-sum'})).payload.dueDay,'2026-10-02');
  assert.deepEqual(await f.store.getDraft({problemId:'sum',language:'python'}),before);
});

test('archived review is absent from today; restoring retains progress and completion creates no snapshot',async t=>{
  const f=await fixture(t);
  await f.store.putRecord({kind:'review',id:'review-sum',problemId:'sum',payload:{dueDay:'2026-10-01',completedAt:null}});
  await f.click('complete-plan','sum');
  const completed=(await f.store.getRecord({kind:'plan',id:'plan-2026-10-02'})).payload;
  assert.equal(completed.completed.sum,true);
  assert.equal((await f.store.listAttempts({problemId:'sum',language:'python'})).items.length,0);
  await f.app.navigate('library');
  await f.click('archive','sum');
  await f.app.navigate('today');
  assert.ok(!f.content().includes('data-action="practice"'));
  await f.app.navigate('library');
  await f.click('filter-archive');
  await f.click('restore','sum');
  await f.app.navigate('today');
  assert.ok(f.content().includes('✓ 已完成'));
  assert.deepEqual((await f.store.getRecord({kind:'plan',id:'plan-2026-10-02'})).payload,completed);
});
