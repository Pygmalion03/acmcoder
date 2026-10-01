import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {gzipSync} from 'node:zlib';
import {execFileSync} from 'node:child_process';

const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const reserved=new Set(['_worker.js','_headers','_redirects','_routes.json']);
export async function inspectPagesArtifact(directory){
  const root=path.resolve(directory),info=JSON.parse(await fs.readFile(path.join(root,'version.json'),'utf8'));
  if(info.target!=='site'||!/^\d+\.\d+\.\d+(?:-rc\.\d+)?$/.test(info.version)||!/^[a-f0-9]{40}$/.test(info.commit||''))throw new Error('Pages requires site metadata with a known source commit');
  const routes=JSON.parse(await fs.readFile(path.join(root,'_routes.json'),'utf8'));
  if(routes.version!==1||JSON.stringify(routes.include)!=='["/api/*"]'||JSON.stringify(routes.exclude)!=='[]')throw new Error('Pages routes must invoke the Worker only for /api/*');
  const worker=await fs.readFile(path.join(root,'_worker.js'));
  if(!worker.length||gzipSync(worker).length>3*1024*1024)throw new Error('API Worker exceeds the free compressed script budget');
  try{execFileSync(process.execPath,['--input-type=module','--check'],{input:worker,stdio:['pipe','ignore','pipe']});}
  catch{throw new Error('Pages Worker must be a JavaScript module, not an upload envelope');}
  if(/\b(?:from\s*|import\s*(?:\(\s*)?)["']node:/.test(worker.toString()))throw new Error('Pages Worker must not depend on Node-only runtime imports');
  const index=await fs.readFile(path.join(root,'index.html')),workspace=await fs.readFile(path.join(root,'workspace.html'));
  if(!index.equals(workspace))throw new Error('Pages root must open the unified workspace');
  for(const file of ['legacy.html','_headers','shared/privacy.html','shared/ui/privacy.css','shared/ui/brand-mark.svg'])await fs.access(path.join(root,file));
  let count=0,totalBytes=0,largest={file:null,bytes:0};
  async function walk(dir){
    for(const entry of await fs.readdir(dir,{withFileTypes:true})){
      const file=path.join(dir,entry.name),relative=path.relative(root,file).split(path.sep).join('/');
      if(entry.isSymbolicLink())throw new Error(`Pages asset is a symbolic link: ${relative}`);
      if(entry.isDirectory()){await walk(file);continue;}
      if(!entry.isFile())throw new Error(`Unsupported Pages asset: ${relative}`);
      if(reserved.has(relative))continue;
      const {size}=await fs.stat(file);if(size>25*1024*1024)throw new Error(`Pages asset exceeds 25 MiB: ${relative}`);
      count++;totalBytes+=size;if(size>largest.bytes)largest={file:relative,bytes:size};
    }
  }
  await walk(root);if(count>20000)throw new Error('Pages assets exceed the free file count');
  const cpp=JSON.parse(await fs.readFile(path.join(root,'vendor/cpp/manifest.json'),'utf8'));
  let cppBytes=0;
  for(const item of cpp.files){
    if(!/^[a-zA-Z0-9_.-]+\.gz$/.test(item.file))throw new Error('Unexpected C++ asset path');
    const bytes=await fs.readFile(path.join(root,'vendor/cpp',item.file));
    if(bytes.length!==item.compressedBytes||hash(bytes)!==item.compressedSha256)throw new Error(`C++ static resource differs: ${item.file}`);
    cppBytes+=bytes.length;
  }
  if(cppBytes!==cpp.totalBytes)throw new Error('C++ resource total differs from the manifest');
  return {version:info.version,commit:info.commit,protocolVersion:info.protocolVersion,tool:{name:'esbuild',version:'0.28.1'},worker:{bytes:worker.length,gzipBytes:gzipSync(worker).length,sha256:hash(worker)},assets:{count,totalBytes,largest},routes,cpp:{version:cpp.version,totalBytes:cpp.totalBytes},deployment:{status:'not-deployed'}};
}
if(process.argv[1]===fileURLToPath(import.meta.url))console.log(JSON.stringify(await inspectPagesArtifact(process.argv[2]||'dist/site'),null,2));
