import fs from 'node:fs/promises';
import path from 'node:path';
import {bundlePython} from './bundle-python.mjs';
import { fileURLToPath } from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const target=process.argv[2] || 'site';
if(!['site','extension','local-web'].includes(target)) throw new Error('Unknown client target');
const source={site:'cloudflare/public',extension:'extension','local-web':'web'}[target];
const destination=path.join(root,'dist',target);
await fs.rm(destination,{recursive:true,force:true});
await fs.mkdir(destination,{recursive:true});
await fs.cp(path.join(root,source),destination,{recursive:true});
await fs.cp(path.join(root,'shared'),path.join(destination,'shared'),{recursive:true});
await fs.copyFile(path.join(root,'data/recommendation/default-catalog.json'),path.join(destination,'shared/catalog.json'));
if(target==='extension'){
  await bundlePython(path.join(destination,'vendor/python'));
  for(const name of ['capture.js','store.js','runner.js']){
    const file=path.join(destination,name);const text=await fs.readFile(file,'utf8');
    await fs.writeFile(file,text.replaceAll("from '../shared/","from './shared/"));
  }
}
const {version}=JSON.parse(await fs.readFile(path.join(root,'package.json'),'utf8'));
if(target==='extension'){
  const file=path.join(destination,'manifest.json');const manifest=JSON.parse(await fs.readFile(file,'utf8'));manifest.version=version;
  await fs.writeFile(file,JSON.stringify(manifest,null,2)+'\n');
}
await fs.writeFile(path.join(destination,'version.json'),JSON.stringify({version,protocolVersion:1,features:{python:true,unifiedWorkspace:'preview'}},null,2)+'\n');
console.log(`Built ${target} ${version} -> ${destination}`);
