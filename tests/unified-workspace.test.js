import test from 'node:test';
import assert from 'node:assert/strict';
import {IDBFactory} from 'fake-indexeddb';
import {createBrowserStore} from '../shared/browser-store.js';
import {mountWorkspace} from '../shared/ui/workspace.js';

// Exercise the actual UI handlers and persisted records. The DOM shell tracks
// replaced fields and their identity; it does not implement product behavior.
async function fixture(t,{timezone='Asia/Shanghai',instant='2026-10-01T16:00:00Z',runner={cancel(){}},account,seed,client={}}={}) {
  const entries=new Map();
  const storage={getItem:k=>entries.get(k)??null,setItem:(k,v)=>entries.set(k,v),removeItem:k=>entries.delete(k)};
  const store=createBrowserStore({namespace:'workspace-test',indexedDB:new IDBFactory(),storage});
  await store.putRecord({kind:'settings',id:'preferences',payload:{timezone,theme:'light',count:3}});
  if(seed)await seed(store);
  const nodes=new Map(),handlers=new Map();
  const decode=value=>value.replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&amp;/g,'&');
  function node(){
    let html='';const ids=new Set(),appended=[];
    const element={value:'',textContent:'',dataset:{},open:false,selectionStart:0,selectionEnd:0,
      addEventListener(){},removeEventListener(){},setAttribute(){},scrollIntoView(){},style:{setProperty(){}},hasPointerCapture(){return false;},
      focus(){globalThis.document.activeElement=element;},setSelectionRange(start,end){element.selectionStart=start;element.selectionEnd=end;},
      append(child){appended.push(child);for(const id of child.ids)ids.add(id);},
      after(child){root.append(child);},
      querySelector(selector){if(selector==='.hero')return {after:child=>element.append(child)};if(selector==='header')return {after:child=>element.append(child)};return nodes.get(selector)||null;},
      querySelectorAll(){return [];},ids,
      get innerHTML(){return html+appended.map(child=>child.innerHTML).join('');},
      set innerHTML(value){
        for(const id of ids)nodes.delete(id);ids.clear();appended.length=0;html=value;
        for(const match of value.matchAll(/<([a-z][\w-]*)\b([^>]*\bid="([^"]+)"[^>]*)>/g)){
          const child=node(),id=`#${match[3]}`;child.id=match[3];
          const end=value.indexOf(`</${match[1]}>`,match.index+match[0].length);
          const text=end<0?'':value.slice(match.index+match[0].length,end);
          child.textContent=decode(text.replace(/<[^>]*>/g,''));
          child.value=match[1]==='textarea'?decode(text):decode(match[2].match(/\bvalue="([^"]*)"/)?.[1]||'');
          nodes.set(id,child);ids.add(id);
        }
      }};
    return element;
  }
  const root=node();root.addEventListener=(type,handler)=>handlers.set(type,handler);
  t.mock.method(globalThis,'setTimeout',()=>0);
  t.mock.method(globalThis,'clearTimeout',()=>{});
  const priorDocument=globalThis.document,priorWindow=globalThis.window;
  globalThis.document={documentElement:{dataset:{}},createElement:node};
  globalThis.window={addEventListener(){},removeEventListener(){}};
  let time=new Date(instant);
  const app=await mountWorkspace(root,{store,runner,account,client,clock:()=>time});
  t.after(()=>{app.destroy();globalThis.document=priorDocument;globalThis.window=priorWindow;});
  return {store,app,root,get:id=>nodes.get(`#${id}`),content:()=>nodes.get('#content').innerHTML,setTime:value=>{time=new Date(value);},
    async click(action,id){
      assert.ok(root.innerHTML.includes(`data-action="${action}"`)||nodes.get('#content').innerHTML.includes(`data-action="${action}"`),`UI exposes ${action}`);
      await handlers.get('click')({target:{closest:()=>({dataset:{action,id}})}});
    },
    change:async(id,value)=>handlers.get('change')({target:{id,value}}),
    input:async(id,value)=>{const target=nodes.get(`#${id}`);target.value=value;await handlers.get('input')({target});}};
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

test('library search preserves the finder, candidates, query and focused input',async t=>{
  const f=await fixture(t);
  await f.app.navigate('library');
  await f.input('problem-request','二分查找');
  const finder=f.get('problem-request'),candidates=f.get('finder-candidates'),status=f.get('finder-status'),search=f.get('search');
  candidates.innerHTML='<p>已找到的候选</p>';status.textContent='选择一项查看题面和样例。';
  search.focus();search.setSelectionRange(1,1);
  await f.input('search','相加');
  assert.equal(f.get('problem-request'),finder);
  assert.equal(finder.value,'二分查找');
  assert.equal(f.get('finder-candidates'),candidates);
  assert.equal(candidates.innerHTML,'<p>已找到的候选</p>');
  assert.equal(f.get('finder-status'),status);
  assert.equal(f.get('search'),search);
  assert.equal(document.activeElement,search);
  assert.equal(search.selectionStart,1);
  assert.ok(f.get('library-rows').innerHTML.includes('两个整数相加'));
  await f.input('search','没有这道题');
  assert.ok(f.get('library-rows').innerHTML.includes('这里还没有题目'));
  assert.equal(f.get('problem-request'),finder);
});

test('first visit has no pretend continuation; an actual practice visit is remembered independently of navigation',async t=>{
  const f=await fixture(t);
  assert.ok(!f.content().includes('继续上次练习'));
  assert.equal(await f.store.getMeta('last-practice'),undefined);
  await f.app.navigate('library');
  await f.app.navigate('today');
  assert.ok(!f.content().includes('继续上次练习'));
  await f.app.navigate('practice','sum');
  const recent=await f.store.getMeta('last-practice');
  assert.equal(recent.problemId,'sum');
  assert.equal(recent.language,'python');
  await f.app.navigate('library');
  await f.app.navigate('today');
  assert.deepEqual(await f.store.getMeta('last-practice'),recent);
  assert.ok(f.content().includes('继续上次练习'));
});

test('continuation uses last practice instead of the problem left in navigation metadata',async t=>{
  const f=await fixture(t,{seed:async store=>{
    await store.putRecord({kind:'problem',id:'recent',payload:{title:'最近练过的题',statement:'题面',tags:[],cases:[]}});
    await store.setMeta('last-practice',{problemId:'recent',language:'python'});
    await store.setMeta('location',{view:'today',problemId:'sum',language:'python'});
  }});
  assert.match(f.content(),/继续上次练习<\/span><h3>最近练过的题<\/h3>/);
});

test('only an existing practice location is migrated into recent practice metadata',async t=>{
  const f=await fixture(t,{seed:store=>store.setMeta('location',{view:'practice',problemId:'sum',language:'python'})});
  assert.deepEqual(await f.store.getMeta('last-practice'),{problemId:'sum',language:'python'});
  await f.app.navigate('today');
  assert.ok(f.content().includes('继续上次练习'));
});

function deferred(){let resolve;const promise=new Promise(r=>{resolve=r;});return {promise,resolve};}

for(const action of ['rewrite','finish','discard'])test(`${action} cancels the previous run before synchronous or late output can reach the new draft`,async t=>{
  const started=deferred(),completion=deferred(),cancelled=[];let emit,runInput;
  const runner={run(input,callback){runInput=input;emit=callback;emit({type:'running'});started.resolve();return completion.promise;},cancel(id){cancelled.push(id);emit({type:'stdout',text:'取消时的旧输出'});}};
  const f=await fixture(t,{runner});
  await f.app.navigate('practice','sum');
  if(action!=='rewrite')await f.click('rewrite');
  const pending=f.click('run');await started.promise;
  await f.click(action);
  assert.deepEqual(cancelled,[runInput.id]);
  assert.equal(f.get('stdout').textContent,'');
  assert.equal(f.get('result-label').textContent,'运行后在这里查看结果');
  const code=f.get('code').value;
  emit({type:'stdout',text:'迟到输出'});emit({type:'complete'});
  completion.resolve({kind:'complete',cancelled:true});await pending;
  assert.equal(f.get('stdout').textContent,'');
  assert.equal(f.get('result-label').textContent,'运行后在这里查看结果');
  assert.equal(f.get('code').value,code);
  const runs=await f.store.listRecords({kind:'run'});
  assert.equal(runs.length,1);
  assert.equal(runs[0].payload.code,runInput.code);
  assert.equal(runs[0].payload.status,'cancelled');
});

test('a run waiting for its draft save cannot start after a rewrite succeeds',async t=>{
  const saving=deferred(),release=deferred();let runCount=0;
  const f=await fixture(t,{runner:{cancel(){},run(){runCount++;throw new Error('obsolete run started');}}});
  await f.app.navigate('practice','sum');
  const original=f.store.saveDraft.bind(f.store);let held=false;
  t.mock.method(f.store,'saveDraft',async input=>{const saved=original(input);if(!held){held=true;saving.resolve();await release.promise;}return saved;});
  const pending=f.click('run');await saving.promise;
  await f.click('rewrite');release.resolve();await pending;
  assert.equal(runCount,0);
  assert.equal((await f.store.getDraft({problemId:'sum',language:'python'})).mode,'rewrite');
});

test('stop while a run waits for its draft save prevents execution and visibly stops it',async t=>{
  const saving=deferred(),release=deferred();let runCount=0;
  const f=await fixture(t,{runner:{cancel(){},run(){runCount++;throw new Error('stopped run started');}}});
  await f.app.navigate('practice','sum');
  const original=f.store.saveDraft.bind(f.store);
  t.mock.method(f.store,'saveDraft',async input=>{const saved=original(input);saving.resolve();await release.promise;return saved;});
  const pending=f.click('run');await saving.promise;
  await f.click('stop');
  assert.equal(f.get('result-label').textContent,'已停止');
  release.resolve();await pending;
  assert.equal(runCount,0);
  assert.equal(f.get('result-label').textContent,'已停止');
  assert.equal((await f.store.listRecords({kind:'run'})).length,0);
});

test('rapid runs waiting for saves execute only the latest request even when saves finish out of order',async t=>{
  const saves=[deferred(),deferred()],releases=[deferred(),deferred()],runs=[];let saving=0;
  const f=await fixture(t,{runner:{cancel(){},run(input,emit){runs.push(input);emit({type:'complete'});return Promise.resolve({kind:'complete'});}}});
  await f.app.navigate('practice','sum');
  const original=f.store.saveDraft.bind(f.store);
  t.mock.method(f.store,'saveDraft',async input=>{const index=saving++,saved=original(input);saves[index].resolve();await releases[index].promise;return saved;});
  f.get('code').value='print("first")';
  const first=f.click('run');await saves[0].promise;
  f.get('code').value='print("latest")';
  const latest=f.click('run');await saves[1].promise;
  releases[1].resolve();await latest;
  releases[0].resolve();await first;
  assert.equal(runs.length,1);
  assert.equal(runs[0].code,'print("latest")');
  const records=await f.store.listRecords({kind:'run'});
  assert.equal(records.length,1);
  assert.equal(records[0].payload.code,'print("latest")');
});

test('failed rewrite retains the active run and original editor',async t=>{
  const started=deferred(),completion=deferred(),cancelled=[];let emit;
  const f=await fixture(t,{runner:{run(input,callback){emit=callback;started.resolve();return completion.promise;},cancel:id=>cancelled.push(id)}});
  await f.app.navigate('practice','sum');
  const code=f.get('code').value,pending=f.click('run');await started.promise;
  t.mock.method(f.store,'startRewrite',async()=>{throw new Error('重写保存失败');});
  await f.click('rewrite');
  assert.deepEqual(cancelled,[]);
  assert.equal(f.get('code').value,code);
  emit({type:'stdout',text:'8\n'});emit({type:'complete'});completion.resolve({kind:'complete'});await pending;
  assert.equal(f.get('result-label').textContent,'样例通过');
});

test('visible save and account status follow actual save failures and adapter notifications',async t=>{
  let syncText='已同步到云端';
  const f=await fixture(t,{account:{user:{login:'tester'},statusText:()=>syncText}});
  assert.equal(f.get('workspace-sync-status').textContent,'tester · 已同步到云端');
  syncText='本机有修改，等待同步';f.app.refreshStatus();
  assert.equal(f.get('workspace-sync-status').textContent,'tester · 本机有修改，等待同步');
  await f.app.navigate('practice','sum');
  const saving=deferred(),release=deferred();
  t.mock.method(f.store,'saveDraft',async()=>{saving.resolve();await release.promise;throw new Error('空间不足');});
  const pending=f.click('run');await saving.promise;
  assert.equal(f.get('workspace-save-status').textContent,'正在保存…');
  release.resolve();await pending;
  assert.equal(f.get('workspace-save-status').textContent,'保存失败，请保留当前页面');
  assert.equal(f.get('save-status').textContent,'保存失败，请保留当前页面');
});

test('sample selection and edits persist with the problem without replacing code or raw examples',async t=>{
  const f=await fixture(t);
  await f.app.navigate('practice','sum');
  const code=f.get('code').value;
  f.get('stdin').value='4 5\n';f.get('expected').value='9\n';
  await f.click('case-add');
  let problem=await f.store.getRecord({kind:'problem',id:'sum'});
  assert.equal(problem.payload.cases.length,2);
  await f.change('case-select','0');
  assert.equal(f.get('stdin').value,'3 5\n');
  f.get('expected').value='8';await f.click('case-update');
  await f.change('case-select','1');await f.click('case-delete');
  problem=await f.store.getRecord({kind:'problem',id:'sum'});
  assert.deepEqual(problem.payload.cases,[{stdin:'3 5\n',expected:'8'}]);
  assert.deepEqual(problem.payload.rawSamples,['输入：3 5\n输出：8']);
  assert.equal((await f.store.getDraft({problemId:'sum',language:'python'})).code,code);
});

test('batch run persists each sample result and preserves the current custom input',async t=>{
  const calls=[];
  const f=await fixture(t,{runner:{cancel(){},async run(input,emit){calls.push(input);emit({type:'stdout',id:input.id,text:'8\n'});return {kind:'complete'};}}});
  await f.app.navigate('practice','sum');
  f.get('stdin').value='9 9\n';f.get('expected').value='18\n';await f.click('case-add');
  f.get('stdin').value='custom input';f.get('expected').value='custom output';
  await f.click('run-all');
  assert.deepEqual(calls.map(call=>call.stdin),['3 5\n','9 9\n']);
  const runs=await f.store.listRecords({kind:'run'});
  assert.equal(runs.length,2);
  assert.deepEqual(runs.map(run=>run.payload.status).sort(),['self_fail','self_pass']);
  assert.equal(new Set(runs.map(run=>run.payload.batchId)).size,1);
  assert.equal(f.get('stdin').value,'custom input');
  assert.equal((await f.store.getDraft({problemId:'sum',language:'python'})).expected,'custom output');
  assert.match(f.get('case-results').innerHTML,/输出不匹配/);
  assert.match(f.get('result-label').textContent,/1 \/ 2/);
});

test('stopping the UI batch cancels its active sample and never starts the next one',async t=>{
  const started=deferred(),finished=deferred();let calls=0;
  const f=await fixture(t,{runner:{run(){calls++;started.resolve();return finished.promise;},cancel(){finished.resolve({kind:'complete',cancelled:true});}}});
  await f.app.navigate('practice','sum');await f.click('case-add');
  const pending=f.click('run-all');await started.promise;await f.click('stop');await pending;
  assert.equal(calls,1);
  assert.equal(f.get('result-label').textContent,'已停止');
  assert.equal((await f.store.listRecords({kind:'run'}))[0].payload.status,'cancelled');
});

test('run history exposes snapshots, paging and filters without altering the active draft',async t=>{
  const f=await fixture(t);
  const before=await f.store.getDraft({problemId:'sum',language:'python'});
  for(let i=0;i<12;i++)await f.store.putRecord({kind:'run',id:`history-${i}`,problemId:'sum',language:'python',payload:{code:'<script>snapshot</script>',stdin:'1 2',expected:'3',stdout:'3',stderr:'',status:'self_pass',createdAt:Date.parse('2026-10-02T08:00:00Z')+i}});
  await f.app.navigate('history');
  assert.match(f.content(),/第 1 \/ 2 页/);
  assert.match(f.content(),/&lt;script&gt;snapshot&lt;\/script&gt;/);
  assert.ok(!f.content().includes('<script>snapshot</script>'));
  await f.click('runs-next');assert.match(f.content(),/第 2 \/ 2 页/);
  await f.change('run-history-day','2026-10-03');assert.match(f.content(),/没有符合条件/);
  await f.click('runs-clear');assert.match(f.content(),/共 12 条/);
  assert.deepEqual(await f.store.getDraft({problemId:'sum',language:'python'}),before);
});

test('rewrite comparison shows code and input differences while retaining both snapshots',async t=>{
  const f=await fixture(t);await f.app.navigate('practice','sum');
  await f.click('rewrite');f.get('code').value='print(8)';f.get('stdin').value='4 4\n';
  await f.click('finish');
  assert.match(f.get('comparison').innerHTML,/data-kind="added"/);
  assert.match(f.get('comparison').innerHTML,/data-kind="removed"/);
  assert.match(f.get('comparison').innerHTML,/标准输入差异/);
  assert.equal((await f.store.listAttempts({problemId:'sum',language:'python'})).items.length,2);
});

test('today UI can replace and defer a persisted selection without bringing it back on refresh',async t=>{
  const f=await fixture(t,{seed:async store=>{
    await store.putRecord({kind:'settings',id:'preferences',payload:{timezone:'Asia/Shanghai',theme:'light',count:1}});
    await store.putRecord({kind:'problem',id:'other',payload:{title:'另一道题'}});
    await store.setMeta('last-practice',{problemId:'sum',language:'python'});
  }});
  await f.click('replace-plan','sum');
  assert.equal((await f.store.getRecord({kind:'plan',id:'plan-2026-10-02'})).payload.items[0].problemId,'other');
  await f.click('defer-plan','other');
  await f.app.refreshFromCloud();
  assert.match(f.content(),/今日暂无待练题目/);
  assert.equal((await f.store.getRecord({kind:'review',id:'review-other'})).payload.dueDay,'2026-10-03');
});
