import fs from 'node:fs/promises';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {gzipSync} from 'node:zlib';
const root=path.resolve(new URL('..',import.meta.url).pathname);
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
export async function bundleJava(destination){
  const prepared=path.join(root,'dist/local-web/language-probe');
  execFileSync('python3',[path.join(root,'experiments/browser-languages/prepare.py'),prepared,'--language','java'],{stdio:'inherit'});
  const directory=path.join(prepared,'java');await fs.mkdir(destination,{recursive:true});
  execFileSync('python3',[path.join(root,'scripts/prepare-java-source.py'),path.join(destination,'licenses')],{stdio:'inherit'});
  const parts=[await fs.readFile(path.join(directory,'browserfs.js'),'utf8'),await fs.readFile(path.join(root,'shared/runners/java-scheduler.js'),'utf8'),await fs.readFile(path.join(directory,'doppio.js'),'utf8'),await fs.readFile(path.join(root,'experiments/browser-languages/java-quota.js'),'utf8'),await fs.readFile(path.join(root,'shared/runners/java-worker.js'),'utf8')];
  const files=[];
  async function add(name,bytes){
    const compressed=gzipSync(bytes,{level:9});
    if(compressed.length>25*1024*1024||bytes.length>70000000)throw new Error('Java asset exceeds its delivery bound');
    const file=`resource-${files.length}.gz`;await fs.writeFile(path.join(destination,file),compressed);
    files.push({name,file,bytes:bytes.length,compressedBytes:compressed.length,sha256:hash(bytes),compressedSha256:hash(compressed)});
  }
  await add('worker.js',Buffer.from(parts.join('\n')));
  const sizes=JSON.parse(await fs.readFile(path.join(directory,'file-sizes.json'),'utf8'));
  for(const name of Object.keys(sizes).sort())await add(name,await fs.readFile(path.join(directory,name)));
  const bridge=await fs.readFile(path.join(root,'shared/runners/java-bridge.js'),'utf8');
  const bridgeName=`bridge-${hash(bridge).slice(0,24)}.html`;
  const csp=`default-src 'none'; script-src blob: 'unsafe-eval' 'sha256-${createHash('sha256').update(bridge).digest('base64')}'; worker-src blob:; connect-src 'none'; object-src 'none'`;
  await fs.writeFile(path.join(destination,bridgeName),`<!doctype html><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${csp}"><title>隔离 Java 运行器</title><script>${bridge}</script>`);
  const manifest={version:'doppio0.5-jcl3.2-acmcoder.1',encoding:'gzip',bridge:bridgeName,files,totalBytes:files.reduce((sum,file)=>sum+file.compressedBytes,0)};
  await fs.writeFile(path.join(destination,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
  return manifest;
}
