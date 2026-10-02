import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import {createHash} from 'node:crypto';
import {gzipSync} from 'node:zlib';
import {createJavaResourceLoader} from '../shared/runners/java-loader.js';
import {createJavaRunner} from '../shared/runners/java-runner.js';

test('Java resources reject corruption and traversal before starting a worker',async()=>{
  const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
  const files=['worker.js','vendor/java_home/lib/rt.jar'].map((name,i)=>{const raw=Buffer.from('public runtime '+name),zip=gzipSync(raw);return {name,file:`resource-${i}.gz`,bytes:raw.length,compressedBytes:zip.length,sha256:hash(raw),compressedSha256:hash(zip),raw,zip};});
  const manifest={version:'doppio0.5-jcl3.2-acmcoder.1',encoding:'gzip',bridge:`bridge-${'a'.repeat(24)}.html`,files,totalBytes:files.reduce((sum,file)=>sum+file.compressedBytes,0)};
  let damaged=true;const downloads=[];
  const loader=createJavaResourceLoader({fetcher:async(url,options)=>{assert.equal(options.credentials,'omit');if(url.endsWith('manifest.json'))return Response.json(manifest);downloads.push(url);return new Response(damaged?'corrupt':files.find(file=>url.endsWith(file.file)).zip);}});
  await assert.rejects(loader(),/校验失败/);damaged=false;
  assert.deepEqual((await loader()).resources.map(file=>new TextDecoder().decode(file.bytes)),files.map(file=>file.raw.toString()));
  manifest.files[1].name='vendor/java_home/../escape';const count=downloads.length;await assert.rejects(loader(),/版本不匹配/);assert.equal(downloads.length,count);
});

test('Java rejects code-generating class metadata and host allocations before they occur',async()=>{
  let constructed=0,exceeded=0;
  class ArrayClass {componentClassName='B';getInternalName(){return '[B';} _constructConstructor(){constructed++;return class{constructor(thread,length){this.array=new Array(length);}};}}
  class RefClass {fields=[];getMethods(){return [];}getInternalName(){return this.name||'LMain;';}_constructConstructor(){constructed++;return class{};}}
  const context={Doppio:{VM:{ClassFile:{ArrayClassData:ArrayClass,ReferenceClassData:RefClass}}},TextEncoder};
  vm.runInNewContext(await fs.readFile(new URL('../experiments/browser-languages/java-quota.js',import.meta.url),'utf8'),context);
  const guard=context.installJavaAllocationQuota(context.Doppio,{limit:1024,onExceeded:()=>exceeded++});
  const malicious=new RefClass();malicious.name='LMain";postMessage("escape");//';assert.throws(()=>malicious._constructConstructor(),/class name/);assert.equal(constructed,0);
  const amplified=new RefClass();amplified.fields=[{name:'a'.repeat(300000),rawDescriptor:'I'}];assert.throws(()=>amplified._constructConstructor(),/allocation limit/);assert.equal(constructed,0);
  guard.begin(1024);const ArrayType=new ArrayClass()._constructConstructor();assert.throws(()=>new ArrayType(null,80*1024*1024),/allocation limit/);assert.equal(exceeded,2);
  guard.begin(1024);let wrote=false;const fakeFs={write(){wrote=true;}};guard.protectFiles(fakeFs);assert.throws(()=>fakeFs.write(1,new Uint8Array(2000),0,2000,0,()=>{}),/allocation limit/);assert.equal(wrote,false);
  guard.begin(1024);let mallocCalled=false;const heap={malloc(){mallocCalled=true;}};guard.protect({getHeap:()=>heap,registerNatives(){}});assert.throws(()=>heap.malloc(2000),/allocation limit/);assert.equal(mallocCalled,false);
});

test('stopping Java during preparation never creates a late iframe',async()=>{
  let finishLoad;let created=0;
  const runner=createJavaRunner({loadResources:()=>new Promise(resolve=>finishLoad=resolve),createFrame:()=>{created++;throw new Error('must not start');}});
  const result=runner.run({id:'cancelled',language:'java',code:'public class Main{}',stdin:''},()=>{});runner.cancel('cancelled');assert.equal((await result).cancelled,true);
  finishLoad({resources:[],bridgeUrl:'/bridge.html'});await new Promise(resolve=>setImmediate(resolve));assert.equal(created,0);runner.destroy();
});
