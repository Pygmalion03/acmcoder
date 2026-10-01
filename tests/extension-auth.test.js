import test from 'node:test';
import assert from 'node:assert/strict';
import {installDeviceAuth,createExtensionAuth} from '../extension/auth.js';
import {createDeviceAuth} from '../cloudflare/lib/device-auth.js';
import {createTestDatabase} from './helpers/d1.js';

const SITE='https://acmcoder-unified-preview.pages.dev',ID='a'.repeat(32);
const SESSION='acmcoder.device.session',PERSIST='acmcoder.device.refresh',PENDING='acmcoder.device.pending';
function fixture(t,{registered=false,startFailure=false,badCallback=false}={}){
  const {db,sqlite}=createTestDatabase(['0001_initial.sql','0002_restore_entries.sql','0003_unified_records.sql','0004_device_auth.sql']);
  let now=1000000000,listener,lastStart,launches=0,nextTab=1,beforeTokenReturn;
  const remote=createDeviceAuth(db,{origin:SITE,extensionIds:registered?[ID]:[],clock:()=>Math.floor(now/1000)});
  const calls=[],tabs=new Map(),accessLevels=[];
  function area(){const values={};return {values,async setAccessLevel(value){accessLevels.push(value.accessLevel);},async get(key){return {[key]:values[key]};},async set(data){Object.assign(values,structuredClone(data));},async remove(keys){for(const key of Array.isArray(keys)?keys:[keys])delete values[key];}};}
  const local=area(),session=area();
  const ownSender={id:ID,url:`chrome-extension://${ID}/workspace.html`};
  const message=(type,values={},sender=ownSender)=>new Promise(resolve=>listener({type:`ACMCODER_AUTH_${type}`,...values},sender,resolve));
  t.mock.method(Date,'now',()=>now);
  const previousChrome=Object.getOwnPropertyDescriptor(globalThis,'chrome');
  t.after(()=>{if(previousChrome)Object.defineProperty(globalThis,'chrome',previousChrome);else delete globalThis.chrome;});
  globalThis.chrome={storage:{local,session},runtime:{id:ID,getURL:path=>`chrome-extension://${ID}/${path}`,onMessage:{addListener(value){listener=value;}},sendMessage:input=>message(input.type.replace('ACMCODER_AUTH_',''),input)},identity:{getRedirectURL:path=>`https://${ID}.chromiumapp.org/${path}`,async launchWebAuthFlow(){launches++;const approved=await remote.approve(lastStart.userCode,'a');const url=new URL(approved.redirectUrl);if(badCallback)url.searchParams.set('state','wrong');return url.href;}},tabs:{async create({url}){const tab={id:nextTab++,url};tabs.set(tab.id,tab);return tab;},async get(id){if(!tabs.has(id))throw new Error('No tab');return tabs.get(id);}}};
  t.mock.method(globalThis,'fetch',async(url,options)=>{
    assert.equal(options.credentials,'omit');assert.equal(options.cache,'no-store');
    const data=JSON.parse(options.body),operation=new URL(url).pathname.split('/').at(-1);calls.push({operation,mode:data.mode});
    try{
      if(startFailure&&operation==='start')return Response.json({code:'temporarily_unavailable'},{status:503});
      const user=operation==='revoke'?await remote.authenticate(options.headers.authorization?.replace('Bearer ','')):null;
      const result=operation==='revoke'?await remote.revoke(user.id,user.deviceId):await remote[operation](data);
      if(operation==='start')lastStart=result;if(operation==='token'&&beforeTokenReturn)await beforeTokenReturn();
      return Response.json(result);
    }catch(error){return Response.json({code:error.code},{status:error.status});}
  });
  installDeviceAuth();t.after(()=>sqlite.close());
  return {remote,sqlite,local,session,tabs,calls,accessLevels,message,advance:ms=>now+=ms,restart:()=>installDeviceAuth(),set beforeTokenReturn(value){beforeTokenReturn=value;},get start(){return lastStart;},get launches(){return launches;}};
}

test('registered extension retains PKCE and rejects a mismatched callback state',async t=>{
  const f=fixture(t,{registered:true,badCallback:true});
  const result=await f.message('CONNECT');assert.equal(result.ok,false);assert.match(result.error,/回调无效/);
  assert.equal(f.launches,1);assert.equal(f.tabs.size,0);assert.equal(f.session.values[SESSION],undefined);
  assert.deepEqual(f.calls,[{operation:'start',mode:'pkce'}]);
});

test('registered extension exchanges PKCE approval without opening a device tab',async t=>{
  const f=fixture(t,{registered:true});const result=await f.message('CONNECT');
  assert.deepEqual(result,{ok:true,result:{user:{id:'a',login:'a',avatarUrl:''}}});
  assert.equal(f.launches,1);assert.equal(f.tabs.size,0);assert.equal(f.local.values[PERSIST],undefined);
  assert.equal((await f.remote.authenticate(f.session.values[SESSION].accessToken)).id,'a');
});

test('fresh ZIP ID uses explicit device approval, never exposes secrets or grants before approval',async t=>{
  const f=fixture(t);const start=await f.message('CONNECT');
  assert.deepEqual(start,{ok:true,result:{pending:true,interval:5}});
  assert.deepEqual(f.calls.map(call=>call.mode),['pkce','device']);assert.equal(f.launches,0);
  assert.equal(f.tabs.size,1);assert.equal([...f.tabs.values()][0].url,f.start.verificationUrl);
  assert.equal(f.session.values[SESSION],undefined);assert.equal(f.local.values[PERSIST],undefined);
  assert.deepEqual(f.accessLevels,['TRUSTED_CONTEXTS','TRUSTED_CONTEXTS']);
  f.advance(5000);assert.deepEqual((await f.message('POLL')).result,{pending:true,interval:5});
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM device_grants').get().n,0);
  await f.remote.approve(f.start.userCode,'a');f.advance(5000);
  const connected=await f.message('POLL');assert.equal(connected.result.user.id,'a');
  assert.deepEqual(Object.keys(connected.result),['user']);assert.equal(f.session.values[PENDING],undefined);
  assert.equal(f.local.values[PERSIST],undefined);assert.ok(await f.remote.authenticate(f.session.values[SESSION].accessToken));
});

test('pending device approval resumes across worker restart without a second grant or tab',async t=>{
  const f=fixture(t);await f.message('CONNECT',{remember:true});const start=f.start;
  f.restart();assert.deepEqual((await f.message('CONNECT')).result,{pending:true,interval:5});
  assert.equal(f.tabs.size,1);assert.equal(f.calls.length,2);
  await f.remote.approve(start.userCode,'a');f.advance(5000);
  const results=await Promise.all([f.message('POLL'),f.message('POLL')]);
  assert.ok(results.every(result=>result.ok&&result.result.user.id==='a'));
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM device_grants').get().n,1);
  assert.equal(f.local.values[PERSIST].remember,true);assert.equal('accessToken' in f.local.values[PERSIST],false);
});

test('closing unapproved confirmation or expiry clears pending authorization, retaining learning storage',async t=>{
  const f=fixture(t);f.local.values.learningDraft={code:'print(42)',stdin:'原样输入'};
  await f.message('CONNECT');f.tabs.clear();f.advance(5000);
  const closed=await f.message('POLL');assert.equal(closed.ok,false);assert.match(closed.error,/页面已关闭/);
  assert.equal(f.session.values[PENDING],undefined);assert.equal(f.session.values[SESSION],undefined);
  await f.message('CONNECT');f.advance(601000);const expired=await f.message('POLL');
  assert.equal(expired.ok,false);assert.match(expired.error,/过期/);
  assert.equal(f.session.values[PENDING],undefined);assert.equal(f.local.values.learningDraft.stdin,'原样输入');
});

test('approved device may close confirmation before poll; logout cancels pending and preserves learning data',async t=>{
  const f=fixture(t);await f.message('CONNECT');await f.remote.approve(f.start.userCode,'a');f.tabs.clear();f.advance(5000);
  assert.equal((await f.message('POLL')).result.user.id,'a');
  const access=f.session.values[SESSION].accessToken;await f.message('LOGOUT');assert.equal(await f.remote.authenticate(access),null);
  await f.message('CONNECT');f.local.values.learningDraft='saved';
  assert.equal((await f.message('LOGOUT')).ok,true);assert.equal(f.session.values[PENDING],undefined);
  assert.equal((await f.message('POLL')).ok,false);assert.equal(f.local.values.learningDraft,'saved');
});

test('logout during token exchange cannot restore a canceled connection',async t=>{
  const f=fixture(t);await f.message('CONNECT',{remember:true});await f.remote.approve(f.start.userCode,'a');f.advance(5000);
  let entered,release;const barrier=new Promise(resolve=>entered=resolve),waiting=new Promise(resolve=>release=resolve);
  f.beforeTokenReturn=async()=>{entered();await waiting;};
  const polling=f.message('POLL');await barrier;assert.equal((await f.message('LOGOUT')).ok,true);release();
  assert.equal((await polling).ok,false);assert.equal(f.session.values[SESSION],undefined);
  assert.equal(f.session.values[PENDING],undefined);assert.equal(f.local.values[PERSIST],undefined);
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM device_grants WHERE revoked_at IS NULL').get().n,0);
});

test('website/content script and runner cannot poll, and network errors never downgrade PKCE',async t=>{
  const f=fixture(t,{startFailure:true});
  for(const sender of [{id:ID,url:SITE+'/'},{id:ID,url:`chrome-extension://${ID}/runner/python-bridge.html`},{id:'b'.repeat(32),url:`chrome-extension://${ID}/workspace.html`}]){
    assert.equal((await f.message('POLL',{},sender)).ok,false);
  }
  assert.equal(f.calls.length,0);assert.equal((await f.message('CONNECT')).ok,false);
  assert.deepEqual(f.calls,[{operation:'start',mode:'pkce'}]);assert.equal(f.tabs.size,0);
});

test('extension client polls through short worker messages until explicit approval succeeds',async t=>{
  const f=fixture(t);let waits=0;
  t.mock.method(globalThis,'setTimeout',(callback,ms)=>{f.advance(ms);waits++;queueMicrotask(async()=>{if(waits===2)await f.remote.approve(f.start.userCode,'a');callback();});});
  const connected=await createExtensionAuth().connect(false);
  assert.equal(connected.user.id,'a');assert.equal(waits,2);assert.equal(f.session.values[PENDING],undefined);
});
