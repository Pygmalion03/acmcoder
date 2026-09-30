import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createCloudAuth} from '../src/server/cloud-auth.js';
import {createDeviceAuth} from '../cloudflare/lib/device-auth.js';
import {createTestDatabase} from './helpers/d1.js';
test('local device credentials are private, independent, refreshed and cleared on revocation',async()=>{
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'acmcoder-cloud-auth-'));
  const {db}=createTestDatabase(['0001_initial.sql','0002_restore_entries.sql','0003_unified_records.sql','0004_device_auth.sql']);let time=1000000000;
  const remote=createDeviceAuth(db,{origin:'https://acmcoder-unified-preview.pages.dev',clock:()=>Math.floor(time/1000)});
  const local=createCloudAuth({credentialDir:directory,clock:()=>time,fetch:async(url,options)=>{
    const operation=new URL(url).pathname.split('/').at(-1);
    try{const data=JSON.parse(options.body);const result=operation==='revoke'?await remote.revoke('a',(await local.status()).deviceId):await remote[operation](data);return Response.json(result);}
    catch(error){return Response.json({code:error.code,error:error.message},{status:error.status});}
  }});
  try{
    const start=await local.start();assert.equal('deviceCode' in start,false);assert.deepEqual(await local.poll(),{state:'pending'});await remote.approve(start.userCode,'a');
    time+=5000;assert.equal((await local.poll()).state,'connected');assert.equal((await local.status()).user.id,'a');
    const files=await fs.readdir(directory);assert.equal(files.length,1);const file=path.join(directory,files[0]);assert.equal((await fs.stat(file)).mode&0o777,0o600);
    let saved=JSON.parse(await fs.readFile(file,'utf8'));assert.ok(await remote.authenticate(saved.accessToken));
    time+=901000;await assert.rejects(local.fetch('sync/push',{},'b'),e=>e.code==='account_changed');
    const rotated=JSON.parse(await fs.readFile(file,'utf8'));assert.notEqual(rotated.refreshToken,saved.refreshToken);assert.ok(await remote.authenticate(rotated.accessToken));
    await local.disconnect();assert.equal(await remote.authenticate(rotated.accessToken),null);assert.equal((await local.status()).user,null);assert.equal((await fs.readdir(directory)).length,0);
  }finally{await fs.rm(directory,{recursive:true,force:true});}
});
