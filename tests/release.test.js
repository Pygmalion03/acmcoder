import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {execFileSync} from 'node:child_process';
import {extensionVersion,releaseLanguages,buildInfo} from '../scripts/release-version.mjs';
import {validateRelease,REQUIRED_ACCEPTANCE} from '../scripts/check-release.mjs';

const fixture=version=>({version,lockVersion:version,manifest:{version:extensionVersion(version),version_name:version},clients:['site','extension','local-web'].map(target=>({version,commit:'a'.repeat(40),sourceState:'clean',target,protocolVersion:1,minProtocolVersion:1,languages:target==='local-web'?['python','cpp','java']:version==='4.0.0-rc.1'?['python']:['python','cpp']}))});
test('extension RC numbers update monotonically into the stable version',()=>{
  const order=version=>extensionVersion(version).split('.').map(Number);
  assert.ok(order('4.0.0-rc.2')[3]>order('4.0.0-rc.1')[3]);
  assert.ok(order('4.0.0')[3]>order('4.0.0-rc.2')[3]);assert.ok(order('4.0.1-rc.1')[2]>order('4.0.0')[2]);
  for(const version of ['4.0.0-rc.65535','65536.0.0','04.0.0','4.0.0-beta'])assert.throws(()=>extensionVersion(version));
});
test('old RC metadata retains Python while rc4 adds browser C++ without removing local Java',()=>{
  assert.deepEqual(releaseLanguages('4.0.0-rc.3','site'),['python']);
  assert.deepEqual(releaseLanguages('4.0.0-rc.4','extension'),['python','cpp']);
  assert.deepEqual(releaseLanguages('4.0.0','site'),['python','cpp']);
  assert.deepEqual(releaseLanguages('4.0.0-rc.4','local-web'),['python','cpp','java']);
  assert.deepEqual(releaseLanguages('4.1.0-rc.1','site'),['python','cpp','java']);
  assert.deepEqual(releaseLanguages('4.1.0-rc.1','extension'),['python','cpp','java']);
});
test('release checks reject mixed source commits, wrong tag and unaccepted stable releases',()=>{
  const candidate=fixture('4.0.0-rc.1');assert.deepEqual(validateRelease({...candidate,candidate:true}),[]);
  candidate.clients[1].commit='b'.repeat(40);assert.ok(validateRelease({...candidate,candidate:true}).length);
  const stable=fixture('4.0.0');assert.ok(validateRelease(stable).some(s=>s.includes('ai-real-three-clients')));
  const acceptance=Object.fromEntries(REQUIRED_ACCEPTANCE.map(id=>[id,{status:'passed',evidence:'Synthetic test-only acceptance; not project evidence.'}]));
  assert.deepEqual(validateRelease({...stable,license:true,acceptance}),[]);
  assert.ok(validateRelease({...stable,license:true,acceptance,tag:'v3.0.4'}).length);
});
test('stable release requires the two W5 acceptances and cannot substitute a storage probe',()=>{
  const stable=fixture('4.0.0');
  const acceptance=Object.fromEntries(REQUIRED_ACCEPTANCE.filter(id=>!['cloud-backup-roundtrip','backup-edit-during-export'].includes(id)).map(id=>[id,{status:'passed',evidence:'Unit fixture only; not product acceptance.'}]));
  acceptance['native-backup-concurrency']={status:'passed',evidence:'Narrow storage probe only.'};
  assert.deepEqual(validateRelease({...stable,license:true,acceptance}),['Acceptance pending: cloud-backup-roundtrip','Acceptance pending: backup-edit-during-export']);
  acceptance['cloud-backup-roundtrip']={status:'passed',evidence:'Unit fixture only.'};
  assert.deepEqual(validateRelease({...stable,license:true,acceptance}),['Acceptance pending: backup-edit-during-export']);
});

test('release packaging refuses modified or unverified builds even when their commit labels agree',()=>{
 for(const state of ['modified','unverified',undefined]){
  const candidate=fixture('4.0.0-rc.1');for(const client of candidate.clients)client.sourceState=state;
  assert.ok(validateRelease({...candidate,candidate:true}).some(failure=>failure.includes('verified clean source')));
 }
});

test('build metadata distinguishes committed source from local edits and source exports',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'acmcoder-build-source-'));
 const prior={...process.env};
 try{
  for(const name of ['ACMCODER_BUILD_COMMIT','CF_PAGES_COMMIT_SHA','GITHUB_SHA','ACMCODER_BUILD_SOURCE_STATE'])delete process.env[name];
  await fs.writeFile(path.join(root,'package.json'),JSON.stringify({version:'4.1.0'}));
  assert.equal((await buildInfo(root,'local-web')).channel,'development');
  const git=(...args)=>execFileSync('git',args,{cwd:root,stdio:'ignore'});
  git('init');git('add','package.json');git('-c','user.name=Test','-c','user.email=test@example.invalid','commit','-m','Fixture');
  const clean=await buildInfo(root,'local-web');assert.equal(clean.sourceState,'clean');assert.equal(clean.channel,'stable');
  await fs.writeFile(path.join(root,'new-feature.js'),'export const changed=true;');
  const modified=await buildInfo(root,'local-web');assert.equal(modified.commit,clean.commit);assert.equal(modified.sourceState,'modified');assert.equal(modified.channel,'development');
 }finally{
  for(const name of ['ACMCODER_BUILD_COMMIT','CF_PAGES_COMMIT_SHA','GITHUB_SHA','ACMCODER_BUILD_SOURCE_STATE'])if(prior[name]===undefined)delete process.env[name];else process.env[name]=prior[name];
  await fs.rm(root,{recursive:true,force:true});
 }
});
