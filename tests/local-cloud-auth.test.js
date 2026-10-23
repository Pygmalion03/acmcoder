import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createCloudAuth} from '../src/server/cloud-auth.js';
import {createDeviceAuth} from '../cloudflare/lib/device-auth.js';
import {createTestDatabase} from './helpers/d1.js';
import {CLOUD_ORIGIN} from '../shared/deployment.js';
test('local device credentials are private, independent, refreshed and cleared on revocation',async()=>{
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'acmcoder-cloud-auth-'));
  const {db}=createTestDatabase(['0001_initial.sql','0002_restore_entries.sql','0003_unified_records.sql','0004_device_auth.sql']);let time=1000000000;
  const remote=createDeviceAuth(db,{origin:'https://acmcoder-unified-preview.pages.dev',clock:()=>Math.floor(time/1000)});
  const local=createCloudAuth({credentialDir:directory,clock:()=>time,fetch:async(url,options)=>{
    assert.equal(new URL(url).origin,CLOUD_ORIGIN);assert.equal(options.redirect,'error');
    const operation=new URL(url).pathname.split('/').at(-1);
    try{const data=JSON.parse(options.body);const result=operation==='revoke'?await remote.revoke('a',(await local.status()).deviceId):await remote[operation](data);return Response.json(result);}
    catch(error){return Response.json({code:error.code,error:error.message},{status:error.status});}
  }});
  try{
    const start=await local.start();assert.equal('deviceCode' in start,false);assert.deepEqual(await local.poll(),{state:'pending'});await remote.approve(start.userCode,'a');
    time+=5000;assert.equal((await local.poll()).state,'connected');assert.equal((await local.status()).user.id,'a');
    const files=await fs.readdir(directory);assert.equal(files.length,1);const file=path.join(directory,files[0]);assert.equal((await fs.stat(file)).mode&0o777,0o600);
    let saved=JSON.parse(await fs.readFile(file,'utf8'));assert.ok(await remote.authenticate(saved.accessToken));
    assert.equal(saved.origin,CLOUD_ORIGIN);
    time+=901000;await assert.rejects(local.fetch('sync/push',{},'b'),e=>e.code==='account_changed');
    const rotated=JSON.parse(await fs.readFile(file,'utf8'));assert.notEqual(rotated.refreshToken,saved.refreshToken);assert.ok(await remote.authenticate(rotated.accessToken));
    await local.disconnect();assert.equal(await remote.authenticate(rotated.accessToken),null);assert.equal((await local.status()).user,null);assert.equal((await fs.readdir(directory)).length,0);
  }finally{await fs.rm(directory,{recursive:true,force:true});}
});

test('self-hosted local auth isolates credentials by configured origin and keeps sync path restrictions',async()=>{
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'acmcoder-self-host-auth-')),origin='https://practice.example.test';
  const deployment={cloudOrigin:origin,websiteOrigins:[origin]},calls=[];
  const fetch=async(url,options)=>{calls.push({url,options});assert.equal(new URL(url).origin,origin);assert.equal(options.redirect,'error');return Response.json({changes:[],nextCursor:0,hasMore:false});};
  try{
    const credential={origin:CLOUD_ORIGIN,accessToken:'synthetic-access',refreshToken:'synthetic-refresh',expiresAt:Date.now()+900000,user:{id:'synthetic-user'},deviceId:'synthetic-device'};
    await fs.writeFile(path.join(directory,`${new URL(CLOUD_ORIGIN).hostname}.json`),JSON.stringify(credential));
    const local=createCloudAuth({deployment,credentialDir:directory,fetch});
    assert.equal((await local.status()).user,null);
    await assert.rejects(local.fetch('sync/push',{},'synthetic-user'),error=>error.code==='401');assert.equal(calls.length,0);
    await fs.writeFile(path.join(directory,'practice.example.test.json'),JSON.stringify(credential));
    assert.equal((await local.status()).user,null,'a mislabeled file cannot reuse another origin grant');
    await fs.writeFile(path.join(directory,'practice.example.test.json'),JSON.stringify({...credential,origin}));
    assert.equal((await local.status()).user.id,'synthetic-user');
    await local.fetch('sync/pull?cursor=0&limit=50',undefined,'synthetic-user');assert.equal(calls.length,1);
    for(const api of ['https://another.example.test/api/sync/push','../devices/token','sync/pull?cursor=0&limit=50&next=another'])await assert.rejects(local.fetch(api,{},'synthetic-user'),/INVALID_SYNC_PATH/);
    assert.equal(calls.length,1);
    assert.throws(()=>createCloudAuth({deployment,origin:CLOUD_ORIGIN,credentialDir:directory,fetch}),/INVALID_CLOUD_ORIGIN/);
  }finally{await fs.rm(directory,{recursive:true,force:true});}
});

test('local authorization rejects redirected requests and foreign verification links',async()=>{
  const origin='https://practice.example.test',deployment={cloudOrigin:origin,websiteOrigins:[origin]};
  const redirected=createCloudAuth({deployment,fetch:async(_url,options)=>{assert.equal(options.redirect,'error');return Response.redirect('https://another.example.test',307);}});
  await assert.rejects(redirected.start(),/INVALID_AUTH_REDIRECT/);
  const foreign=createCloudAuth({deployment,fetch:async()=>Response.json({userCode:'ABCDEF1234',deviceCode:'synthetic',verificationUrl:'https://another.example.test/connect.html?code=ABCDEF1234',expiresIn:600,interval:5})});
  await assert.rejects(foreign.start(),/INVALID_VERIFICATION_URL/);
  assert.deepEqual(await foreign.poll(),{state:'expired'});
});
