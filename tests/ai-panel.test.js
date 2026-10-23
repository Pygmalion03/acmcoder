import test from 'node:test';
import assert from 'node:assert/strict';
import {IDBFactory} from 'fake-indexeddb';
import {createBrowserStore} from '../shared/browser-store.js';
import {createAIPanel} from '../shared/ui/ai.js';

function container(){
  const nodes=new Map(),drawer={open:true};let html='';
  return {
    get innerHTML(){return html;},
    set innerHTML(value){
      html=value;nodes.clear();
      for(const match of value.matchAll(/<[a-z][\w-]*\b([^>]*\bid="([^"]+)"[^>]*)>/g))nodes.set(`#${match[2]}`,{innerHTML:'',textContent:'',value:match[1].match(/\bvalue="([^"]*)"/)?.[1]||'',checked:/\bchecked\b/.test(match[1]),disabled:/\bdisabled\b/.test(match[1]),scrollTop:0,scrollHeight:1000});
    },
    querySelector:selector=>nodes.get(selector),closest:()=>drawer,
    get:id=>nodes.get(`#${id}`),click:id=>nodes.get(`#${id}`).onclick()
  };
}
function deferred(){let resolve;const promise=new Promise(r=>{resolve=r;});return {promise,resolve};}
async function fixture(t,{count=25,transport=async()=>({message:'测试回答'})}={}){
  const store=createBrowserStore({namespace:crypto.randomUUID(),indexedDB:new IDBFactory(),storage:null});
  for(const problemId of ['one','two']){
    await store.putRecord({kind:'problem',id:problemId,payload:{title:problemId}});
    for(let index=0;index<count;index++)await store.putRecord({kind:'conversation',id:`${problemId}-turn-${index}`,problemId,language:'python',payload:{format:'turn-v1',startedAt:1000+index,messages:[{role:'user',content:`${problemId} 问 ${index}`,requestId:`request-${index}`},{role:'assistant',content:`${problemId} 答 ${index}`,requestId:`request-${index}`}]}});
  }
  const ui=await createAIPanel({store,adapter:{transport}});t.after(()=>ui.destroy());
  const pane=container();
  return {store,ui,pane,mount:problemId=>ui.mount(pane,{problemId,language:'python',context:()=>({})})};
}

test('conversation UI reads pages on demand and navigates older, newer and latest with legacy history intact',async t=>{
  const f=await fixture(t);
  await f.store.putRecord({kind:'conversation',id:'one--python',problemId:'one',language:'python',payload:{messages:[{role:'user',content:'旧问题'},{role:'assistant',content:'旧回答'}]}});
  const calls=[],read=f.store.listConversationTurns.bind(f.store);
  t.mock.method(f.store,'listConversationTurns',options=>{calls.push(options);return read(options);});
  await f.mount('one');
  assert.equal(calls.length,1);assert.equal(calls[0].limit,10);
  assert.match(f.pane.get('ai-messages').innerHTML,/one 答 24/);assert.doesNotMatch(f.pane.get('ai-messages').innerHTML,/one 答 14/);
  assert.equal(f.pane.get('ai-history-range').textContent,'本页 20 条 · 完整历史已保留');
  assert.equal(f.pane.get('ai-newer').disabled,true);
  await f.pane.click('ai-older');
  assert.match(f.pane.get('ai-messages').innerHTML,/one 答 14/);assert.doesNotMatch(f.pane.get('ai-messages').innerHTML,/one 答 24/);
  assert.ok(calls[1].cursor);assert.equal(f.pane.get('ai-newer').disabled,false);
  await f.pane.click('ai-newer');assert.match(f.pane.get('ai-messages').innerHTML,/one 答 24/);
  await f.pane.click('ai-older');await f.pane.click('ai-older');
  assert.match(f.pane.get('ai-messages').innerHTML,/旧回答/);assert.match(f.pane.get('ai-messages').innerHTML,/one 答 4/);
  assert.equal(f.pane.get('ai-older').disabled,true);
  await f.pane.click('ai-latest');assert.match(f.pane.get('ai-messages').innerHTML,/one 答 24/);
  assert.equal(calls.filter(call=>!call.legacy).length,6);assert.ok(calls.every(call=>call.limit===(call.legacy?1:10)));
});

test('a delayed page from the previous problem cannot replace a newly mounted panel',async t=>{
  const f=await fixture(t),started=deferred(),release=deferred(),read=f.store.listConversationTurns.bind(f.store);
  t.mock.method(f.store,'listConversationTurns',async options=>{if(options.problemId==='one'){started.resolve();await release.promise;}return read(options);});
  const old=f.mount('one');await started.promise;
  await f.mount('two');const current=f.pane.get('ai-messages').innerHTML;
  release.resolve();await old;
  assert.equal(f.pane.get('ai-messages').innerHTML,current);assert.match(current,/two 答 24/);
  assert.equal(f.pane.get('ai-history-range').textContent,'本页 20 条 · 完整历史已保留');
});

test('a newer history request wins over a delayed older page in the same panel',async t=>{
  const f=await fixture(t);await f.mount('one');
  const started=deferred(),release=deferred(),read=f.store.listConversationTurns.bind(f.store);
  t.mock.method(f.store,'listConversationTurns',async options=>{if(options.cursor){started.resolve();await release.promise;}return read(options);});
  const older=f.pane.click('ai-older');await started.promise;
  await f.pane.click('ai-latest');release.resolve();await older;
  assert.match(f.pane.get('ai-messages').innerHTML,/one 答 24/);assert.doesNotMatch(f.pane.get('ai-messages').innerHTML,/one 答 14/);
  assert.equal(f.pane.get('ai-newer').disabled,true);
});

test('history read failures are visible and can retry without losing the question',async t=>{
  const f=await fixture(t),read=f.store.listConversationTurns.bind(f.store);let fail=true;
  t.mock.method(f.store,'listConversationTurns',options=>{if(fail){fail=false;throw new Error('暂时无法读取');}return read(options);});
  await f.mount('one');f.pane.get('ai-question').value='保留我的问题';
  assert.match(f.pane.get('ai-history-range').textContent,/对话读取失败/);assert.equal(f.pane.get('ai-latest').disabled,false);
  await f.pane.click('ai-latest');
  assert.match(f.pane.get('ai-messages').innerHTML,/one 答 24/);assert.equal(f.pane.get('ai-question').value,'保留我的问题');
});

test('destroyed panels ignore a page that finishes later',async t=>{
  const f=await fixture(t),started=deferred(),release=deferred(),read=f.store.listConversationTurns.bind(f.store);
  t.mock.method(f.store,'listConversationTurns',async options=>{started.resolve();await release.promise;return read(options);});
  const mounting=f.mount('one');await started.promise;f.ui.destroy();
  const before=f.pane.get('ai-messages').innerHTML;release.resolve();await mounting;
  assert.equal(f.pane.get('ai-messages').innerHTML,before);
});

test('failed answer persistence keeps the question and retries saving without another model request',async t=>{
  let requests=0;
  const f=await fixture(t,{count:0,transport:async()=>{requests++;return {message:'已经收到的测试回答'};}});
  const settings=container();await f.ui.mount(settings);
  settings.get('ai-base').value='https://provider.test/v1';settings.get('ai-model').value='test-model';settings.get('ai-key').value='test-only-key';
  await settings.click('ai-save');await f.mount('one');
  f.pane.get('ai-question').value='保留问题并保存回答';await f.pane.get('ai-question').oninput();
  const put=f.store.putRecord.bind(f.store);let fail=true;
  t.mock.method(f.store,'putRecord',record=>{if(fail&&record.kind==='conversation'&&record.payload.messages.some(message=>message.role==='assistant')){fail=false;throw new Error('写入失败');}return put(record);});
  await f.pane.click('ai-send');
  assert.equal(requests,1);assert.equal(f.pane.get('ai-question').value,'保留问题并保存回答');
  assert.match(f.pane.get('ai-chat-status').textContent,/保存失败/);assert.equal(f.pane.get('ai-send').disabled,false);
  const failed=await f.store.getMeta('ai-input:one--python');assert.ok(failed.requestId);
  await f.pane.click('ai-send');
  assert.equal(requests,1);assert.match(f.pane.get('ai-messages').innerHTML,/已经收到的测试回答/);
  assert.deepEqual(await f.store.getMeta('ai-input:one--python'),{});
});
