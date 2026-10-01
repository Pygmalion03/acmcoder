import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../cloudflare/worker.js';

test('Pages entry keeps public language bytes in the asset service',async()=>{
  const request=new Request('https://acmcoder.example/vendor/cpp/clang22.gz');
  let served=0;
  const response=await worker.fetch(request,{ASSETS:{fetch(input){assert.equal(input,request);served++;return new Response('public test bytes');}}},{});
  assert.equal(served,1);assert.equal(await response.text(),'public test bytes');
});
test('Pages entry uses the existing anonymous and protected API without the asset fallback',async()=>{
  const env={DB:{},ASSETS:{fetch(){assert.fail('API must not return the HTML fallback');}}};
  const session=await worker.fetch(new Request('https://acmcoder.example/api/auth/session'),env,{});
  assert.equal(session.status,200);assert.deepEqual(await session.json(),{loginAvailable:false,authenticated:false,user:null});
  const records=await worker.fetch(new Request('https://acmcoder.example/api/records'),env,{});
  assert.equal(records.status,401);assert.match(records.headers.get('content-type'),/application\/json/);
});
