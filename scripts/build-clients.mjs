import fs from 'node:fs/promises';
import path from 'node:path';
import {bundlePython} from './bundle-python.mjs';
import {bundleCpp} from './bundle-cpp.mjs';
import {buildExtensionIcons} from './build-brand.mjs';
import { fileURLToPath } from 'node:url';
import {execFileSync} from 'node:child_process';
import {buildInfo,extensionVersion} from './release-version.mjs';
import {bundleOffline} from './bundle-offline.mjs';
import {bundleJava} from './bundle-java.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const target=process.argv[2] || 'site';
if(target==='all'){for(const name of ['site','extension','local-web'])execFileSync(process.execPath,[fileURLToPath(import.meta.url),name],{stdio:'inherit'});process.exit(0);}
if(!['site','extension','local-web'].includes(target)) throw new Error('Unknown client target');
const source={site:'cloudflare/public',extension:'extension','local-web':'web'}[target];
const destination=path.join(root,'dist',target);
await fs.rm(destination,{recursive:true,force:true});
await fs.mkdir(destination,{recursive:true});
await fs.cp(path.join(root,source),destination,{recursive:true});
await fs.cp(path.join(root,'shared'),path.join(destination,'shared'),{recursive:true});
await fs.copyFile(path.join(root,'data/recommendation/default-catalog.json'),path.join(destination,'shared/catalog.json'));
if(target!=='local-web')await bundleCpp(path.join(destination,'vendor/cpp'));
let javaManifest;
if(target!=='local-web')javaManifest=await bundleJava(path.join(destination,'vendor/java'));
if(target==='site'){
  await bundlePython(path.join(destination,'vendor/python'));
  await fs.copyFile(path.join(root,'extension/runner/bridge.js'),path.join(destination,'runner/bridge.js'));
}
if(target==='extension'){
  // Content scripts are classic scripts. Bundle the shared text rules into the
  // isolated-world entry instead of exposing a module to the source webpage.
  execFileSync('npx',['--yes','esbuild@0.28.1',path.join(root,'extension/content-script.js'),'--bundle','--format=iife','--platform=browser','--target=es2022',`--outfile=${path.join(destination,'content-script.js')}`],{cwd:root,stdio:'inherit'});
  execFileSync(process.execPath,['--input-type=commonjs','--check'],{input:await fs.readFile(path.join(destination,'content-script.js')),stdio:['pipe','inherit','inherit']});
  await buildExtensionIcons(path.join(destination,'icons'));
  await bundlePython(path.join(destination,'vendor/python'));
  for(const name of ['capture.js','store.js','runner.js','handoff.js']){
    const file=path.join(destination,name);const text=await fs.readFile(file,'utf8');
    await fs.writeFile(file,text.replaceAll("from '../shared/","from './shared/"));
  }
}
if(target==='local-web'){
  await fs.copyFile(path.join(destination,'index.html'),path.join(destination,'legacy.html'));
  await fs.copyFile(path.join(destination,'workspace.html'),path.join(destination,'index.html'));
}
const info=await buildInfo(root,target),{version}=info;
if(target==='extension'){
  const file=path.join(destination,'manifest.json');const manifest=JSON.parse(await fs.readFile(file,'utf8'));manifest.version=extensionVersion(version);manifest.version_name=version;
  manifest.sandbox.pages.push(`vendor/java/${javaManifest.bridge}`);
  const {createHash}=await import('node:crypto');
  const bridge=await fs.readFile(path.join(root,'shared/runners/java-bridge.js'));
  manifest.content_security_policy.sandbox=manifest.content_security_policy.sandbox.replace("'wasm-unsafe-eval'",`'wasm-unsafe-eval' 'unsafe-eval' 'sha256-${createHash('sha256').update(bridge).digest('base64')}'`);
  await fs.writeFile(file,JSON.stringify(manifest,null,2)+'\n');
}
await fs.writeFile(path.join(destination,'version.json'),JSON.stringify(info,null,2)+'\n');
for(const name of ['THIRD_PARTY_NOTICES.md','LICENSE']){
  try{await fs.copyFile(path.join(root,name),path.join(destination,name));}catch(error){if(error.code!=='ENOENT')throw error;}
}
if(target==='site')await bundleOffline(destination);
console.log(`Built ${target} ${version} -> ${destination}`);
