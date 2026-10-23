import test from 'node:test';
import assert from 'node:assert/strict';
import {IDBFactory} from 'fake-indexeddb';
import {createBrowserStore} from '../shared/browser-store.js';
import {getDailyQueue,completeDailyProblem,deferDailyProblem,replaceDailyProblem} from '../shared/daily-queue.js';

const day='2026-10-13',tomorrow='2026-10-14';
async function setup(ids){
  const store=createBrowserStore({namespace:'daily-queue-test',indexedDB:new IDBFactory(),storage:null});
  for(const id of ids)await store.putRecord({kind:'problem',id,payload:{title:id}});
  return store;
}
const review=(store,problemId,dueDay,completedAt=null)=>store.putRecord({kind:'review',id:`review-${problemId}`,problemId,payload:{dueDay,completedAt}});
const ids=queue=>queue.entries.map(entry=>entry.problemId);

test('daily plans prioritize due reviews, then unfinished last practice, then a stable deduplicated order',async()=>{
  const store=await setup(['e','d','c','b','a']);
  await review(store,'c','2026-10-12');await review(store,'b','2026-10-11');await review(store,'e',tomorrow);
  const queue=await getDailyQueue({store,day,count:5,lastPractice:{problemId:'d'},timezone:'Asia/Shanghai'});
  assert.deepEqual(ids(queue),['b','c','d','a','e']);
  assert.deepEqual(queue.entries.map(entry=>entry.reason),['review','review','resume','practice','practice']);
  assert.equal(queue.plan.payload.timezone,'Asia/Shanghai');
  assert.deepEqual((await store.getRecord({kind:'plan',id:`plan-${day}`})).payload.items,queue.entries.map(({problemId,reason})=>({problemId,reason})));
  const next=await getDailyQueue({store,day:tomorrow,count:5,lastPractice:{problemId:'b'}});
  assert.equal(new Set(ids(next)).size,5);assert.equal(next.entries[0].reason,'review');
});

test('refresh and count changes preserve selected order and completion records as new candidates arrive',async()=>{
  const store=await setup(['b','c','d']);
  assert.deepEqual(ids(await getDailyQueue({store,day,count:2})),['b','c']);
  await completeDailyProblem({store,day,problemId:'c',now:100});
  await store.putRecord({kind:'problem',id:'a',payload:{title:'new urgent review'}});await review(store,'a','2026-10-01');
  assert.deepEqual(ids(await getDailyQueue({store,day,count:2})),['b','c']);
  const reduced=await getDailyQueue({store,day,count:1});
  assert.deepEqual(ids(reduced),['b']);assert.equal(reduced.plan.payload.completed.c,true);assert.equal(reduced.plan.payload.items.length,2);
  const expanded=await getDailyQueue({store,day,count:3});
  assert.deepEqual(ids(expanded),['b','c','a']);assert.equal(expanded.entries[1].completed,true);
});

test('archived items hide and return to their saved position; deleted items are removed from the plan',async()=>{
  const store=await setup(['a','b','c']);await getDailyQueue({store,day,count:2});
  await store.archiveProblem('a');assert.deepEqual(ids(await getDailyQueue({store,day,count:2})),['b','c']);
  await store.restoreProblem('a');assert.deepEqual(ids(await getDailyQueue({store,day,count:2})),['a','b']);
  await store.deleteProblem('a',{confirmed:true});const after=await getDailyQueue({store,day,count:2});
  assert.deepEqual(ids(after),['b','c']);assert.ok(after.plan.payload.items.every(item=>item.problemId!=='a'));
});

test('deferring reserves the removed slot for today and schedules a fresh review for the supplied tomorrow',async()=>{
  const store=await setup(['a','b','c']);await review(store,'a',day,123);await getDailyQueue({store,day,count:2});
  await deferDailyProblem({store,day,tomorrow,problemId:'a'});
  const current=await getDailyQueue({store,day,count:2});
  assert.deepEqual(ids(current),['b']);assert.deepEqual(current.plan.payload.excluded,['a']);
  assert.deepEqual((await store.getRecord({kind:'review',id:'review-a'})).payload,{dueDay:tomorrow,completedAt:null});
  await store.archiveProblem('a');await store.restoreProblem('a');
  assert.deepEqual(ids(await getDailyQueue({store,day,count:2})),['b']);
  const next=await getDailyQueue({store,day:tomorrow,count:2});
  assert.deepEqual(ids(next),['a','b']);assert.equal(next.entries[0].reason,'review');
});

test('replacement can use a hidden selected item, excludes old choices, and does not change the plan without a candidate',async()=>{
  const store=await setup(['a','b','c','d']);await getDailyQueue({store,day,count:3});
  assert.equal((await getDailyQueue({store,day,count:2})).canReplace,true);
  const first=await replaceDailyProblem({store,day,count:2,problemId:'a'});assert.equal(first.replacement.problemId,'c');
  assert.deepEqual(ids(await getDailyQueue({store,day,count:2})),['c','b']);
  await replaceDailyProblem({store,day,count:2,problemId:'c'});
  const current=await getDailyQueue({store,day,count:2});
  assert.deepEqual(ids(current),['d','b']);assert.equal(current.canReplace,false);assert.deepEqual(current.plan.payload.excluded,['a','c']);
  await assert.rejects(replaceDailyProblem({store,day,count:2,problemId:'d'}),/没有可替换的题目/);
  assert.deepEqual((await store.getRecord({kind:'plan',id:`plan-${day}`})).payload,current.plan.payload);
});

test('completion toggles the current due review and preserves a future review and older completion keys',async()=>{
  const store=await setup(['a','b']);
  await store.putRecord({kind:'plan',id:`plan-${day}`,payload:{day,completed:{legacy:true}}});
  await review(store,'a',day);await review(store,'b',tomorrow);
  const queue=await getDailyQueue({store,day,count:2,lastPractice:{problemId:'b'}});assert.equal(queue.plan.payload.completed.legacy,true);
  assert.equal((await completeDailyProblem({store,day,problemId:'a',now:123})).completed,true);
  assert.equal((await store.getRecord({kind:'review',id:'review-a'})).payload.completedAt,123);
  assert.equal((await completeDailyProblem({store,day,problemId:'a',now:124})).completed,false);
  assert.equal((await store.getRecord({kind:'review',id:'review-a'})).payload.completedAt,null);
  await completeDailyProblem({store,day,problemId:'b',now:125});
  assert.equal((await store.getRecord({kind:'review',id:'review-b'})).payload.completedAt,null);
  assert.equal((await store.getRecord({kind:'plan',id:`plan-${day}`})).payload.completed.legacy,true);
});
