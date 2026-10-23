import test from 'node:test';
import assert from 'node:assert/strict';
import {createLocalClient} from '../web/unified-store.js';

test('local client notifies changes after successful writes, but not reads or failed writes',async t=>{
  const calls=[];let fail=false;
  t.mock.method(globalThis,'fetch',async(url,options)=>{
    if(url==='/api/session')return {json:async()=>({token:'test-token'})};
    const data=JSON.parse(options.body);calls.push(data);
    return {ok:!fail,json:async()=>fail?{error:'保存失败'}:{result:data.args[0]??null}};
  });
  const client=await createLocalClient(),store=client.store('account:a');let changes=0;
  store.subscribe(()=>changes++);
  for(const method of ['putRecord','startRewrite','finishRewrite','discardRewrite','archiveProblem','restoreProblem','deleteProblem','restoreBackup','syncResolve','syncCopyConflict','backupCopyConflict']){
    const before=changes;
    await store[method]('input');assert.equal(changes,before+1,`${method} notifies the sync status`);
  }
  const before=changes;await store.getRecord('input');await store.setMeta('last-page','practice');
  assert.equal(changes,before);
  fail=true;await assert.rejects(store.putRecord('input'),/保存失败/);assert.equal(changes,before);
  assert.ok(calls.every(call=>call.namespace==='account:a'));
});
