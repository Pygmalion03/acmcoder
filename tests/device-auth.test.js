import test from 'node:test';
import assert from 'node:assert/strict';
import {createTestDatabase} from './helpers/d1.js';
import {createDeviceAuth,pkceChallenge,digest} from '../cloudflare/lib/device-auth.js';
import {onRequest} from '../cloudflare/functions/api/[[path]].js';
const origin='https://acmcoder.example',extensionId='a'.repeat(32);
function setup(){const {db,sqlite}=createTestDatabase(['0001_initial.sql','0002_restore_entries.sql','0003_unified_records.sql','0004_device_auth.sql']);let time=100000;return {db,sqlite,auth:createDeviceAuth(db,{origin,extensionIds:[extensionId],clock:()=>time}),advance:n=>time+=n};}
const pending=error=>error.code==='authorization_pending';
test('device approval is explicit, rate-limited, expires and is consumed once',async()=>{
  const {auth,advance}=setup();const start=await auth.start({name:'本地电脑'});
  await assert.rejects(auth.token({deviceCode:start.deviceCode}),pending);
  await assert.rejects(auth.token({deviceCode:start.deviceCode}),e=>e.code==='slow_down');
  await auth.approve(start.userCode,'a');await assert.rejects(auth.approve(start.userCode,'b'),e=>e.code==='already_approved');
  advance(5);const result=await auth.token({deviceCode:start.deviceCode,userId:'b'});assert.equal(result.user.id,'a');
  await assert.rejects(auth.token({deviceCode:start.deviceCode}),e=>e.code==='invalid_grant');
  const expired=await auth.start({name:'expired'});advance(601);await assert.rejects(auth.token({deviceCode:expired.deviceCode}),e=>e.code==='expired_token');
});
test('PKCE and registered callback are required; wrong verifier cannot consume approval',async()=>{
  const {auth}=setup();const verifier='x'.repeat(64),data={name:'插件',mode:'pkce',codeChallengeMethod:'S256',codeChallenge:await pkceChallenge(verifier),state:'s'.repeat(64),redirectUri:`https://${extensionId}.chromiumapp.org/connect`};
  await assert.rejects(auth.start({...data,redirectUri:'https://evil.example/connect'}),e=>e.code==='unregistered_extension');
  const start=await auth.start(data),approved=await auth.approve(start.userCode,'a'),url=new URL(approved.redirectUrl);assert.equal(url.searchParams.get('state'),data.state);
  await assert.rejects(auth.token({deviceCode:start.deviceCode,codeVerifier:verifier}),e=>e.code==='invalid_grant');
  await assert.rejects(auth.token({deviceCode:url.searchParams.get('code'),codeVerifier:'wrong'.repeat(12)}),e=>e.code==='invalid_pkce');
  const result=await auth.token({deviceCode:url.searchParams.get('code'),codeVerifier:verifier});assert.equal(result.user.id,'a');
});
test('concurrent exchanges issue only one grant; refresh rotates and old token reuse revokes chain',async()=>{
  const {auth,advance,sqlite}=setup();const start=await auth.start({name:'电脑'});await auth.approve(start.userCode,'a');
  const outcomes=await Promise.allSettled([auth.token({deviceCode:start.deviceCode}),auth.token({deviceCode:start.deviceCode})]);assert.equal(outcomes.filter(r=>r.status==='fulfilled').length,1);
  const first=outcomes.find(r=>r.status==='fulfilled').value;assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM device_grants').get().n,1);
  assert.equal((await auth.authenticate(first.accessToken)).id,'a');advance(901);assert.equal(await auth.authenticate(first.accessToken),null);
  const next=await auth.refresh({refreshToken:first.refreshToken});assert.equal((await auth.authenticate(next.accessToken)).id,'a');
  await assert.rejects(auth.refresh({refreshToken:first.refreshToken}),e=>e.code==='refresh_reused');assert.equal(await auth.authenticate(next.accessToken),null);
  await assert.rejects(auth.refresh({refreshToken:next.refreshToken}),e=>e.code==='invalid_grant');
});
test('revocation cannot affect another account; account deletion removes credentials',async()=>{
  const {auth,sqlite}=setup();const start=await auth.start({name:'插件'});await auth.approve(start.userCode,'a');const tokens=await auth.token({deviceCode:start.deviceCode});
  await auth.revoke('b',tokens.deviceId);assert.ok(await auth.authenticate(tokens.accessToken));
  await auth.revoke('a',tokens.deviceId);assert.equal(await auth.authenticate(tokens.accessToken),null);
  const second=await auth.start({name:'本地'});await auth.approve(second.userCode,'a');await auth.token({deviceCode:second.deviceCode});
  sqlite.prepare('DELETE FROM users WHERE id=?').run('a');assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM device_grants').get().n,0);assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM device_refresh_tokens').get().n,0);assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM users WHERE id=?').get('b').n,1);
});
test('real API bearer sync works without cookies, cannot manage accounts or forge website approval',async()=>{
  const {db,sqlite}=setup();const apiAuth=createDeviceAuth(db,{origin});const start=await apiAuth.start({name:'插件'});await apiAuth.approve(start.userCode,'a');const tokens=await apiAuth.token({deviceCode:start.deviceCode});
  async function call(path,{method='GET',data,headers={}}={}){return onRequest({env:{DB:db},request:new Request(`${origin}/api/${path}`,{method,headers:{authorization:`Bearer ${tokens.accessToken}`,...(data?{'content-type':'application/json'}:{}),...headers},...(data?{body:JSON.stringify(data)}:{})})});}
  let cursor=null;do{const migrated=await call('records/migrate',{method:'POST',data:{protocolVersion:1,cursor}});assert.equal(migrated.status,200);({nextCursor:cursor}=await migrated.json());}while(cursor);
  assert.equal((await call('sync/pull?cursor=0&limit=50')).status,200);
  assert.equal((await call('sync/pull?cursor=0&limit=50',{headers:{'x-acm-expected-user':'b'}})).status,409);
  assert.equal((await call('account',{method:'DELETE',data:{confirm:'DELETE_MY_ACCOUNT'}})).status,403);
  assert.equal((await call('devices/approve',{method:'POST',data:{userCode:'ABCDEF1234'}})).status,403);
  const session='c'.repeat(64);sqlite.prepare('INSERT INTO sessions(token_hash,user_id,expires_at,created_at) VALUES (?,?,?,?)').run(await digest(session),'a',9999999999,1);
  const request=new Request(`${origin}/api/devices/approve`,{method:'POST',headers:{cookie:`__Host-acm_session=${session}`,origin:'https://evil.example','content-type':'application/json'},body:JSON.stringify({userCode:start.userCode})});assert.equal((await onRequest({env:{DB:db},request})).status,403);
});
