import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
export async function bundleOffline(directory){
  // An opaque sandbox cannot be a Service Worker client. Inline only its fixed
  // bootstrap, authorized by an exact CSP hash; runtime bytes come from the parent.
  let headers=await fs.readFile(path.join(directory,'_headers'),'utf8');
  const hashes=[];
  for(const [html,script,route] of [['runner/bridge.html','runner/bridge.js','/runner/*'],['shared/runners/cpp-bridge.html','shared/runners/cpp-bridge.js','/shared/runners/cpp-bridge']]){
    const source=await fs.readFile(path.join(directory,script),'utf8');
    if(source.includes('</script'))throw new Error('Runner bootstrap cannot contain an HTML script terminator');
    const cspHash=createHash('sha256').update(source).digest('base64');
    hashes.push(`'sha256-${cspHash}'`);
    const sandboxPolicy=`default-src 'none'; script-src blob: 'wasm-unsafe-eval' 'sha256-${cspHash}'; worker-src blob:; connect-src 'none'; object-src 'none'`;
    await fs.writeFile(path.join(directory,html),`<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${sandboxPolicy}"><title>隔离运行器</title><script>${source}</script></head><body></body></html>`);
    headers=headers.split('\n\n').map(block=>block.split('\n')[0].startsWith(route)?block.replace("script-src 'self' blob: 'wasm-unsafe-eval'",`script-src 'self' blob: 'wasm-unsafe-eval' 'sha256-${cspHash}'`):block).join('\n\n');
  }
  headers=headers.split('\n\n').map(block=>['/','/workspace','/workspace.html'].includes(block.split('\n')[0])?block.replace("script-src 'self'",`script-src 'self' blob: 'wasm-unsafe-eval' ${hashes.join(' ')}`).replace("worker-src 'self'","worker-src 'self' blob:"):block).join('\n\n');
  try{
    const java=JSON.parse(await fs.readFile(path.join(directory,'vendor/java/manifest.json'),'utf8'));
    const bridge=await fs.readFile(new URL('../shared/runners/java-bridge.js',import.meta.url));
    const policy=`default-src 'none'; script-src blob: 'unsafe-eval' 'sha256-${createHash('sha256').update(bridge).digest('base64')}'; worker-src blob:; connect-src 'none'; object-src 'none'`;
    // Java's dynamic constructors remain inside an opaque frame. Its immutable
    // bootstrap also needs the HTTP cache because opaque frames cannot use SW.
    headers=headers.trimEnd();
    for(const route of [`/vendor/java/${java.bridge}`,`/vendor/java/${java.bridge.replace(/\.html$/,'')}`])headers+=`\n\n${route}\n  Content-Security-Policy: ${policy}\n  Cache-Control: public, max-age=31536000, immutable`;
  }catch(error){if(error.code!=='ENOENT')throw error;}
  await fs.writeFile(path.join(directory,'_headers'),headers);
  const assets=[];
  async function add(relative){
    const bytes=await fs.readFile(path.join(directory,relative));
    assets.push({path:'/'+relative.split(path.sep).join('/'),bytes:bytes.length,sha256:hash(bytes)});
  }
  async function walk(relative){
    for(const entry of await fs.readdir(path.join(directory,relative),{withFileTypes:true})){
      const file=path.join(relative,entry.name);if(entry.isDirectory())await walk(file);else if(entry.isFile())await add(file);
    }
  }
  for(const file of ['workspace.html','workspace.js','offline.js','offline-account.js','version.json'])await add(file);
  for(const directoryName of ['shared','runner','vendor'])await walk(directoryName);
  assets.sort((a,b)=>a.path.localeCompare(b.path));
  const revision=hash(JSON.stringify({assets,headers:hash(headers)}));
  const source=await fs.readFile(new URL('../cloudflare/offline-worker.js',import.meta.url),'utf8');
  await fs.writeFile(path.join(directory,'offline-worker.js'),source.replace('__OFFLINE_REVISION__',JSON.stringify(revision)).replace('__OFFLINE_ASSETS__',JSON.stringify(assets)));
  return {revision,files:assets.length,bytes:assets.reduce((sum,asset)=>sum+asset.bytes,0)};
}
