import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';

const base=process.env.ACMCODER_PAGES_SMOKE_URL;
if(!base)throw new Error('Set ACMCODER_PAGES_SMOKE_URL to the exact deployment to inspect');
const origin=new URL(base).origin;
const get=pathname=>fetch(new URL(pathname,origin),{credentials:'omit',signal:AbortSignal.timeout(30000)});
const homepage=await get('/');assert.equal(homepage.status,200);assert.match(await homepage.text(),/workspace\.js/);
const info=await get('/version.json').then(r=>{assert.equal(r.status,200);return r.json();});
assert.equal(info.target,'site');assert.ok(info.languages.includes('cpp'));
if(process.env.ACMCODER_BUILD_COMMIT)assert.equal(info.commit,process.env.ACMCODER_BUILD_COMMIT);
const auth=await get('/api/auth/session');assert.equal(auth.status,200);const session=await auth.json();
assert.equal(session.authenticated,false);assert.equal(session.user,null);
const records=await get('/api/records');assert.equal(records.status,401);assert.match(records.headers.get('content-type'),/application\/json/);
const privacy=await get('/shared/privacy.html');assert.equal(privacy.status,200);assert.equal(new URL(privacy.url).origin,origin);
assert.match(await privacy.text(),/数据与隐私/);assert.match(privacy.headers.get('content-security-policy'),/script-src 'none'/);
for(const suffix of ['.html','']){
  const bridge=await get(`/shared/runners/cpp-bridge${suffix}`);assert.equal(bridge.status,200);
  const csp=bridge.headers.get('content-security-policy');assert.match(csp,/connect-src 'none'/);assert.match(csp,/worker-src blob:/);
}
const manifestResponse=await get('/vendor/cpp/manifest.json');assert.equal(manifestResponse.status,200);const manifest=await manifestResponse.json();
for(const item of manifest.files){
  assert.match(item.file,/^[a-zA-Z0-9_.-]+\.gz$/);const response=await get(`/vendor/cpp/${item.file}`);assert.equal(response.status,200);
  const bytes=Buffer.from(await response.arrayBuffer());assert.equal(bytes.length,item.compressedBytes);
  assert.equal(createHash('sha256').update(bytes).digest('hex'),item.compressedSha256);
}
console.log(JSON.stringify({origin,version:info.version,commit:info.commit,anonymousAPI:'passed',protectedAPI:'passed',privacy:'passed',cppBridgeHeaders:'passed',publicCppFiles:manifest.files.length,cppExecution:'not-tested-by-HTTP-smoke'},null,2));
