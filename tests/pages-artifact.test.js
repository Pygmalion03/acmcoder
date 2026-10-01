import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {inspectPagesArtifact} from '../scripts/check-pages.mjs';

async function fixture(t){
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'acmcoder-pages-fixture-'));
  t.after(()=>fs.rm(root,{recursive:true,force:true}));
  const put=async(file,data)=>{const target=path.join(root,file);await fs.mkdir(path.dirname(target),{recursive:true});await fs.writeFile(target,data);};
  const json=(file,data)=>put(file,JSON.stringify(data));
  await json('version.json',{target:'site',version:'4.0.0-rc.4',commit:'a'.repeat(40),protocolVersion:1});
  await json('_routes.json',{version:1,include:['/api/*'],exclude:[]});
  await put('_worker.js','export default {fetch(request,env){return env.ASSETS.fetch(request)}};');
  for(const file of ['index.html','workspace.html','legacy.html','_headers','shared/privacy.html','shared/ui/privacy.css','shared/ui/brand-mark.svg'])await put(file,'test-only fixture');
  const bytes=Buffer.from('test-only public resource');await put('vendor/cpp/worker.js.gz',bytes);
  await json('vendor/cpp/manifest.json',{version:'test-only',totalBytes:bytes.length,files:[{file:'worker.js.gz',compressedBytes:bytes.length,compressedSha256:createHash('sha256').update(bytes).digest('hex')}]});
  return {root,put,json};
}
test('deployment receipt separates a small API Worker from static compiler resources',async t=>{
  const {root}=await fixture(t);const receipt=await inspectPagesArtifact(root);
  assert.equal(receipt.commit,'a'.repeat(40));assert.equal(receipt.worker.bytes,(await fs.stat(path.join(root,'_worker.js'))).size);
  assert.ok(receipt.assets.totalBytes>receipt.cpp.totalBytes);assert.equal(receipt.deployment.status,'not-deployed');
});
test('deployment rejects corrupt compiler bytes and an unknown source',async t=>{
  const {root,put,json}=await fixture(t);
  await put('vendor/cpp/worker.js.gz','changed');await assert.rejects(inspectPagesArtifact(root),/C\+\+ static resource differs/);
  await json('version.json',{target:'site',version:'4.0.0-rc.4',commit:'unknown'});
  await assert.rejects(inspectPagesArtifact(root),/known source commit/);
});
test('deployment rejects static routes consuming Worker quota or an old homepage',async t=>{
  const {root,json,put}=await fixture(t);await json('_routes.json',{version:1,include:['/*'],exclude:[]});
  await assert.rejects(inspectPagesArtifact(root),/only for \/api/);
  await json('_routes.json',{version:1,include:['/api/*'],exclude:[]});await put('index.html','legacy');
  await assert.rejects(inspectPagesArtifact(root),/unified workspace/);
});
test('deployment rejects oversized static files without loading them into memory',async t=>{
  const {root}=await fixture(t);const file=await fs.open(path.join(root,'oversized.wasm'),'w');
  await file.truncate(25*1024*1024+1);await file.close();
  await assert.rejects(inspectPagesArtifact(root),/exceeds 25 MiB/);
});
test('deployment rejects a multipart upload envelope named as _worker.js',async t=>{
  const {root,put}=await fixture(t);
  await put('_worker.js','------formdata-test\r\nContent-Disposition: form-data; name="metadata"\r\n\r\n{"main_module":"worker.js"}\r\n');
  await assert.rejects(inspectPagesArtifact(root),/JavaScript module/);
});
test('deployment rejects an otherwise valid module with a Node-only runtime dependency',async t=>{
  const {root,put}=await fixture(t);
  await put('_worker.js','import {Writable} from "node:stream"; export default {fetch(){return new Response(String(Writable))}};');
  await assert.rejects(inspectPagesArtifact(root),/Node-only runtime imports/);
});
