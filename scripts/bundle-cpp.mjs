import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {gzipSync} from 'node:zlib';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {limitWasmMemory} from './wasm-memory-limit.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
export const CPP_SOURCE='df1180d80184733c6a01599f76b92b4001d20f87';
const release='https://github.com/cppstudio-io/wasm-clang-runtime/releases/download/v0.1.0/';
const source=`https://raw.githubusercontent.com/cppstudio-io/wasm-clang-runtime/${CPP_SOURCE}/`;
const pins={
  clang22:'3f3da7691ecc5d02d7f056ba849eed408fcf494656ad65b5756ba285e59d30a5',
  lld22:'4d88d4faa2bbe22dfb099bf28d8c5884fb3e90462acca4057dbb96746ce99ac4',
  'sysroot22.tar':'d991c621cdf9b4640c2cd4aa21abb08491c2ae6ef9917cac5c6065553604bcec',
  'cpp-shared.js':'27585644f3d8f6a77de392ad98e17b9c195118262a8fa8a3b1e254964d267e4e',
};
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
async function dependency(cache,name,url){
  const file=path.join(cache,name);let bytes;
  try{bytes=await fs.readFile(file);}catch(error){if(error.code!=='ENOENT')throw error;const response=await fetch(url,{signal:AbortSignal.timeout(60000)});if(!response.ok)throw new Error(`C++ dependency ${name}: HTTP ${response.status}`);bytes=Buffer.from(await response.arrayBuffer());await fs.writeFile(file,bytes);}
  if(hash(bytes)!==pins[name])throw new Error(`C++ dependency checksum changed: ${name}`);return bytes;
}
function replaceExactly(text,old,replacement){if(text.split(old).length!==2)throw new Error('C++ upstream adapter changed');return text.replace(old,replacement);}
export async function bundleCpp(outDir,{cacheDir=process.env.ACMCODER_CPP_CACHE||'/tmp/acmcoder-browser-language-assets'}={}){
  await fs.mkdir(cacheDir,{recursive:true});await fs.mkdir(outDir,{recursive:true});
  const entries=await Promise.all(Object.keys(pins).map(async name=>[name,await dependency(cacheDir,name,name.startsWith('cpp-')?source+'src/shared.js':release+name)]));
  const resources=new Map(entries);
  const memfs=await fs.readFile(path.join(root,'third_party/cpp/memfs.wasm'));
  if(hash(memfs)!=='8354810a29ce761771e19fea911c95d2ba666668dc31aa0a605ecb82ab0c1b1c')throw new Error('C++ memfs checksum changed');
  const temporary=path.join(cacheDir,'sysroot22-product.tar');
  // Rebuild the archive using the same small SDK33 iostream used by the real
  // browser probe. No extraction, symlinks or native SDK installation required.
  execFileSync('python3',['-c',String.raw`
import sys,tarfile,hashlib
from pathlib import Path
original,header,destination=map(Path,sys.argv[1:])
with tarfile.open(original) as source,tarfile.open(destination,'w') as out:
 for item in source:
  if item.name=='include/wasm32-wasip1/noeh/c++/v1/iostream':
   item.size=header.stat().st_size
   with header.open('rb') as contents:out.addfile(item,contents)
  else:out.addfile(item,source.extractfile(item) if item.isfile() else None)
`,path.join(cacheDir,'sysroot22.tar'),path.join(root,'third_party/cpp/iostream'),temporary]);
  const sysroot=await fs.readFile(temporary);
  if(hash(sysroot)!=='2e362ff853eedda29ad2a9bb05bfd50d9a9492cd3ee0e47385f685c90bfd8193')throw new Error('C++ standard sysroot checksum changed');
  let engine=resources.get('cpp-shared.js').toString('utf8');
  engine=replaceExactly(engine,'result[name] = obj[name].bind(obj);','result[name] = (...args) => obj[name](...args);');
  // Bound the upstream JS virtual-file allocator as well as WASM linear memory.
  // Compiler output files share a 32MiB budget per invocation; every worker is
  // terminated after one task, so files cannot accumulate across user runs.
  engine=replaceExactly(engine,'const writeFds = new Map();  // fd -> {path, data, len, pos}', 'let virtualBytes = 0;\n    const writeFds = new Map();  // fd -> {path, data, len, pos}');
  engine=replaceExactly(engine,'writeFds.set(fd, {path, data: initial, len: initial.length, pos: 0});','virtualBytes += initial.length;\n          if (virtualBytes > 33554432) throw new Error("运行文件超过 32 MiB，已停止。");\n          writeFds.set(fd, {path, data: initial, len: initial.length, pos: 0});');
  engine=replaceExactly(engine,'const grown = new Uint8Array(Math.max(end, entry.data.length * 2,\n                                                4096));', 'const capacity = Math.max(end, entry.data.length * 2, 4096);\n          virtualBytes += capacity - entry.data.length;\n          if (!Number.isSafeInteger(capacity) || virtualBytes > 33554432) throw new Error("运行文件超过 32 MiB，已停止。");\n          const grown = new Uint8Array(capacity);');
  const worker=Buffer.from(engine+'\n'+await fs.readFile(path.join(root,'shared/runners/cpp-worker.js'),'utf8'));
  const files=[];
  for(const [name,raw] of [['clang22',limitWasmMemory(resources.get('clang22'),8192)],['lld22',limitWasmMemory(resources.get('lld22'),8192)],['memfs',limitWasmMemory(memfs,2048)],['sysroot22-standard.tar',sysroot],['worker.js',worker]]){
    const bytes=Buffer.from(raw),compressed=gzipSync(bytes,{level:9});const file=name+'.gz';
    await fs.writeFile(path.join(outDir,file),compressed);files.push({name,file,bytes:bytes.length,sha256:hash(bytes),compressedBytes:compressed.length,compressedSha256:hash(compressed)});
  }
  await fs.cp(path.join(root,'third_party/cpp/licenses'),path.join(outDir,'licenses'),{recursive:true});
  const manifest={version:'clang22-wasi33-acmcoder.1',source:CPP_SOURCE,standard:'c++17',encoding:'gzip',limits:{compilerMemoryMiB:512,filesystemMemoryMiB:128,virtualFilesMiB:32,userMemoryMiB:64,codeChars:200000,stdinChars:200000,outputChars:32768,compileMs:30000,runMs:5000},files,totalBytes:files.reduce((n,f)=>n+f.compressedBytes,0)};
  await fs.writeFile(path.join(outDir,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');return manifest;
}
if(process.argv[1]===fileURLToPath(import.meta.url)){const m=await bundleCpp(process.argv[2]||path.join(root,'dist/cpp-runtime'));console.log(`Bundled C++17: ${m.totalBytes} compressed bytes`);}
