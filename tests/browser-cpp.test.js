import test from 'node:test';
import assert from 'node:assert/strict';
import {limitWasmMemory} from '../scripts/wasm-memory-limit.mjs';
import {createCppRunner} from '../shared/runners/cpp-runner.js';
import {createMultiRunner} from '../shared/runners/multi-runner.js';
import {createCppResourceLoader} from '../shared/runners/cpp-loader.js';
import {createHash} from 'node:crypto';
import {gzipSync} from 'node:zlib';
const memoryModule=(flags=0,maximum=3)=>new Uint8Array([0,97,115,109,1,0,0,0,5,flags?4:3,1,flags,1,...(flags?[maximum]:[]),7,10,1,6,109,101,109,111,114,121,2,0]);
test('bounded compiler memory actually refuses growth beyond its maximum',async()=>{
  const original=memoryModule(),patched=limitWasmMemory(original,2);
  const {instance}=await WebAssembly.instantiate(patched);
  assert.equal(instance.exports.memory.grow(1),1);assert.throws(()=>instance.exports.memory.grow(1),RangeError);
  assert.equal(original[11],0);
  const bounded=await WebAssembly.instantiate(limitWasmMemory(memoryModule(1,1),2));assert.throws(()=>bounded.instance.exports.memory.grow(1),RangeError);
  assert.throws(()=>limitWasmMemory(memoryModule(3),2),/Unsupported/);
  assert.throws(()=>limitWasmMemory(original.subarray(0,12),2),/Truncated/);
});
test('cancelled resource preparation cannot start a late task or overwrite its successor',async()=>{
  const listeners=new Set(),sent=[];
  const frame={src:'',contentWindow:{postMessage:message=>sent.push(message)}};
  const host={addEventListener:(_,fn)=>listeners.add(fn),removeEventListener:(_,fn)=>listeners.delete(fn)};
  const pending=[];const events=[];
  const runner=createCppRunner({frame,host,loadResources:()=>new Promise(resolve=>pending.push(resolve))});
  const first=runner.run({id:'old',language:'cpp',code:'old',stdin:''},e=>events.push(e));runner.cancel('old');assert.equal((await first).cancelled,true);
  const second=runner.run({id:'new',language:'cpp',code:'new',stdin:''},e=>events.push(e));
  pending[0]([]);await new Promise(resolve=>setImmediate(resolve));assert.equal(frame.src,'');
  pending[1]([]);await new Promise(resolve=>setImmediate(resolve));
  const nonce=frame.src.split('#')[1];const deliver=data=>listeners.forEach(fn=>fn({source:frame.contentWindow,origin:'null',data:{...data,nonce}}));
  deliver({kind:'ready'});assert.equal(sent.at(-1).code,'new');
  deliver({kind:'stdout',id:'old',text:'stale'});deliver({kind:'complete',id:'new'});assert.equal((await second).kind,'complete');assert.equal(events.some(e=>e.text==='stale'),false);runner.destroy();
});
test('switching language terminates the previous runner',async()=>{
  const cancelled=[];let finish;
  const old={run:()=>new Promise(resolve=>finish=resolve),cancel:id=>{cancelled.push(id);finish({cancelled:true});}};
  const next={run:async()=>({kind:'complete'}),cancel:()=>{}};
  const runner=createMultiRunner({python:old,cpp:next});const first=runner.run({language:'python',id:'one'},()=>{});await runner.run({language:'cpp',id:'two'},()=>{});await first;assert.deepEqual(cancelled,['one']);
});

test('runtime loading detects damaged cache bytes, verifies gzip and retries failed downloads',async()=>{
  const names=['clang22','lld22','memfs','sysroot22-standard.tar','worker.js'];
  const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
  const files=names.map(name=>{const raw=Buffer.from('verified public '+name),zip=gzipSync(raw);return {name,file:name+'.gz',raw,zip,bytes:raw.length,compressedBytes:zip.length,sha256:hash(raw),compressedSha256:hash(zip)};});
  const manifest={version:'clang22-wasi33-acmcoder.1',encoding:'gzip',files,totalBytes:files.reduce((n,f)=>n+f.compressedBytes,0)};
  const removed=[],downloads=[];let damaged=true;
  const loader=createCppResourceLoader({cache:{open:async()=>({match:async()=>new Response('damaged cache'),delete:async url=>removed.push(url),put:async()=>{}})},fetcher:async url=>{
    if(url.endsWith('manifest.json'))return Response.json(manifest);
    const f=files.find(f=>url.endsWith(f.file));downloads.push(f.name);return new Response(damaged?'damaged download':f.zip);
  }});
  await assert.rejects(loader(),/校验失败/);damaged=false;
  const result=await loader();assert.deepEqual(result.map(f=>new TextDecoder().decode(f.bytes)),files.map(f=>f.raw.toString()));assert.ok(removed.length>=5);assert.ok(downloads.length>=5);
});
