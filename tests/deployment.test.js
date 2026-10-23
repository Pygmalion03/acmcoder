import test from 'node:test';
import assert from 'node:assert/strict';
import {DEPLOYMENT,CLOUD_ORIGIN,WEBSITE_ORIGINS,normalizeDeployment,matchesStoredOrigin,validateVerificationUrl} from '../shared/deployment.js';

test('default deployment preserves current service addresses and freezes the allowlist',()=>{
  assert.equal(CLOUD_ORIGIN,'https://acmcoder-unified-preview.pages.dev');
  assert.deepEqual(WEBSITE_ORIGINS,['https://acmcoder.pygmalion.top','https://acmcoder-unified-preview.pages.dev']);
  assert.ok(Object.isFrozen(DEPLOYMENT));assert.ok(Object.isFrozen(WEBSITE_ORIGINS));
});

test('self-hosted deployment uses only explicitly configured exact HTTPS origins',()=>{
  assert.deepEqual(normalizeDeployment({cloudOrigin:'https://practice.example.test:443/',websiteOrigins:['https://practice.example.test','https://practice.example.test/']}),{cloudOrigin:'https://practice.example.test',websiteOrigins:['https://practice.example.test']});
  assert.throws(()=>normalizeDeployment({cloudOrigin:'https://practice.example.test',websiteOrigins:['https://another.example.test']}),/CLOUD_ORIGIN_NOT_IN_WEBSITES/);
  for(const origin of ['http://localhost','https://practice.example.test:8443','https://user:pass@practice.example.test','https://practice.example.test/path','https://practice.example.test/.','https://practice.example.test?next=other','https://practice.example.test#fragment','https://*.example.test','https://practice.example.test\\other',' https://practice.example.test','javascript:alert(1)']){
    assert.throws(()=>normalizeDeployment({cloudOrigin:origin,websiteOrigins:[origin]}),/INVALID_DEPLOYMENT_ORIGIN/);
  }
});

test('legacy extension grants never follow a changed deployment origin',()=>{
  assert.equal(matchesStoredOrigin({user:{id:'a'}},CLOUD_ORIGIN),true);
  assert.equal(matchesStoredOrigin({user:{id:'a'}},'https://practice.example.test'),false);
  assert.equal(matchesStoredOrigin({origin:CLOUD_ORIGIN},'https://acmcoder.pygmalion.top'),false);
  assert.equal(matchesStoredOrigin({origin:'https://practice.example.test'},'https://practice.example.test'),true);
});

test('device approval links must match the exact issuing origin, page and public code',()=>{
  const origin='https://practice.example.test',code='ABCDEF1234';
  assert.equal(validateVerificationUrl(`${origin}/connect.html?code=${code}`,origin,code),`${origin}/connect.html?code=${code}`);
  for(const value of [`https://another.example.test/connect.html?code=${code}`,`${origin}/other?code=${code}`,`${origin}/connect.html?code=0000000000`,`${origin}/connect.html?code=${code}&next=https://another.example.test`,`${origin}/connect.html?code=${code}#other`,`https://user:pass@practice.example.test/connect.html?code=${code}`])assert.throws(()=>validateVerificationUrl(value,origin,code),/INVALID_VERIFICATION_URL/);
});
