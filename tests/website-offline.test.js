import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import {bundleOffline} from '../scripts/bundle-offline.mjs';
import {resolveWebsiteAccount,forgetWebsiteAccount} from '../cloudflare/public/offline-account.js';
import {createPythonRunner} from '../shared/runners/python-runner.js';

test('offline account opens only a remembered local namespace; online logout and account switch replace it',()=>{
  const entries=new Map(),storage={getItem:key=>entries.get(key),setItem:(key,value)=>entries.set(key,value),removeItem:key=>entries.delete(key)};
  const first={id:'101',login:'first',token:'must-not-persist'};
  assert.equal(resolveWebsiteAccount({session:{authenticated:true,user:first},storage}),first);
  assert.equal(JSON.stringify([...entries]).includes('must-not-persist'),false);
  assert.deepEqual(resolveWebsiteAccount({unreachable:true,storage}),{id:'101',login:'first'});
  assert.equal(resolveWebsiteAccount({unreachable:true,handoff:true,storage}),null);
  const second={id:'202',login:'second'};resolveWebsiteAccount({session:{authenticated:true,user:second},storage});
  assert.deepEqual(resolveWebsiteAccount({unreachable:true,storage}),second);
  resolveWebsiteAccount({session:{authenticated:false},storage});assert.equal(resolveWebsiteAccount({unreachable:true,storage}),null);
  resolveWebsiteAccount({session:{authenticated:true,user:first},storage});forgetWebsiteAccount(storage);assert.equal(entries.size,0);
});

async function workerFixture({changed=false,redirected=false}={}){
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'acmcoder-offline-'));
  for(const dir of ['shared/runners','runner','vendor'])await fs.mkdir(path.join(directory,dir),{recursive:true});
  await fs.writeFile(path.join(directory,'_headers'),"/runner/*\n  Content-Security-Policy: script-src 'self' blob: 'wasm-unsafe-eval'\n\n/shared/runners/cpp-bridge\n  Content-Security-Policy: script-src 'self' blob: 'wasm-unsafe-eval'");
  for(const file of ['runner/bridge.js','shared/runners/cpp-bridge.js'])await fs.writeFile(path.join(directory,file),'/* fixed bootstrap */');
  const files=['workspace.html','workspace.js','offline.js','offline-account.js','version.json','shared/module.js','runner/bridge.html','vendor/runtime.wasm'];
  for(const file of files)await fs.writeFile(path.join(directory,file),'content:'+file);
  const info=await bundleOffline(directory),source=await fs.readFile(path.join(directory,'offline-worker.js'),'utf8');
  const contents=new Map();for(const name of await fs.readdir(directory,{recursive:true}))if((await fs.stat(path.join(directory,name))).isFile())contents.set('/'+name,await fs.readFile(path.join(directory,name)));
  await fs.rm(directory,{recursive:true});
  const listeners={},buckets=new Map(),fetched=[];
  const caches={async open(name){if(!buckets.has(name))buckets.set(name,new Map());const map=buckets.get(name);return {put:async(key,response)=>map.set(key,response),match:async key=>map.get(key)?.clone()};},keys:async()=>[...buckets.keys()],delete:async name=>buckets.delete(name)};
  let claimed=false;
  vm.runInNewContext(source,{URL,Response,Headers,crypto,Uint8Array,Set,caches,self:{location:{origin:'https://site.invalid'},clients:{claim:async()=>{claimed=true;}},addEventListener:(name,fn)=>listeners[name]=fn},fetch:async(url,options)=>{fetched.push({url,options});const response=new Response(changed&&url==='/vendor/runtime.wasm'?'changed':contents.get(url),{headers:{'content-security-policy':"default-src 'self'",'content-encoding':'br','content-length':'1'}});if(redirected)Object.defineProperty(response,'redirected',{value:true});return response;}});
  const dispatch=async(name,request)=>{let result;listeners[name]({request,waitUntil:promise=>result=promise,respondWith:promise=>result=promise});return result;};
  return {dispatch,buckets,fetched,info,claimed:()=>claimed};
}

test('offline worker serves the complete public graph, runner nonce and root; never intercepts account or AI APIs',async()=>{
  const fixture=await workerFixture();await fixture.dispatch('install');assert.equal(fixture.buckets.size,1);
  assert.ok(fixture.fetched.every(item=>item.options.credentials==='omit'));
  assert.equal((await fixture.dispatch('fetch',new Request('https://site.invalid/'))).status,200);
  assert.equal((await fixture.dispatch('fetch',new Request('https://site.invalid/runner/bridge.html?session=new-nonce'))).status,200);
  for(const url of ['/api/auth/session','/api/records','/api/ai/chat','/connect.html','/legacy.html'])assert.equal(await fixture.dispatch('fetch',new Request('https://site.invalid'+url)),undefined);
  fixture.buckets.set('acmcoder-site-old',new Map());fixture.buckets.set('user-data',new Map());await fixture.dispatch('activate');
  assert.equal(fixture.claimed(),true);assert.equal(fixture.buckets.has('acmcoder-site-old'),false);assert.equal(fixture.buckets.has('user-data'),true);
});

test('a changed runtime rejects offline installation instead of activating a mixed version',async()=>{
  const fixture=await workerFixture({changed:true});await assert.rejects(fixture.dispatch('install'),/changed during download/);assert.equal(fixture.buckets.size,0);
});

test('Pages clean-URL redirects become direct cached navigation responses with security headers intact',async()=>{
  const fixture=await workerFixture({redirected:true});await fixture.dispatch('install');
  const response=await fixture.dispatch('fetch',new Request('https://site.invalid/',{redirect:'manual'}));
  assert.equal(response.redirected,false);assert.equal(await response.text(),'content:workspace.html');
  assert.equal(response.headers.get('content-security-policy'),"default-src 'self'");
  assert.equal(response.headers.has('content-encoding'),false);assert.equal(response.headers.has('content-length'),false);
});

test('stopping Python during resource download resolves immediately and never starts a late worker',async()=>{
  let finishLoad;const events=[];const frame={src:'',contentWindow:{postMessage(){throw new Error('must not start');}}};
  const runner=createPythonRunner({frame,loadResources:()=>new Promise(resolve=>finishLoad=resolve)});
  const pending=runner.run({id:'pending',language:'python',code:'print(1)',stdin:''},event=>events.push(event));
  runner.cancel('pending');assert.equal((await pending).cancelled,true);finishLoad([]);await new Promise(resolve=>setImmediate(resolve));assert.equal(frame.src,'');runner.destroy();
});

test('offline readiness waits for a real nonce-bound Java bootstrap, not just cached bytes',async()=>{
  let receive,frame;
  const status={textContent:''},panel={innerHTML:'',querySelector:()=>status};
  const registration={active:{},waiting:null,addEventListener(){}};
  const context={navigator:{serviceWorker:{register:async()=>registration}},fetch:async()=>Response.json({bridge:`bridge-${'a'.repeat(24)}.html`}),crypto,setTimeout,clearTimeout,
    addEventListener:(name,listener)=>receive=listener,removeEventListener(){},document:{createElement(){return frame={contentWindow:{},setAttribute(){},remove(){}};},body:{append(){}}}};
  const source=(await fs.readFile(new URL('../cloudflare/public/offline.js',import.meta.url),'utf8')).replace('export function','function');vm.runInNewContext(source,context);
  context.startOfflineSupport().mount(panel);await new Promise(resolve=>setImmediate(resolve));
  assert.match(status.textContent,/确认 Java/);assert.ok(frame.src.endsWith('.html#'+frame.src.split('#')[1]));
  const data={kind:'ready',nonce:frame.src.split('#')[1]};receive({source:{},origin:'null',data});receive({source:frame.contentWindow,origin:'https://wrong.invalid',data});assert.doesNotMatch(status.textContent,/已就绪/);
  receive({source:frame.contentWindow,origin:'null',data});await new Promise(resolve=>setImmediate(resolve));assert.match(status.textContent,/离线资源已就绪/);
});
