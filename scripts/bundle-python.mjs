import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
export const PYODIDE_VERSION='0.29.3';
export const PYODIDE_INTEGRITY='sha512-22UBuhOJawj7vKUnS7/F3xK+515LJdjiMAHoCfuS6/PbHiOrSQVnYwDe+2sbVwiOZ3sMMexdXICew6NqOMQGgA==';
export const RUNTIME_FILES=['pyodide.js','pyodide.asm.js','pyodide.asm.wasm','python_stdlib.zip','pyodide-lock.json'];
export async function bundlePython(outDir){
  const lock=JSON.parse(await fs.readFile(path.join(root,'package-lock.json'),'utf8'));
  const entry=lock.packages['node_modules/pyodide'];
  if(entry?.version!==PYODIDE_VERSION||entry?.integrity!==PYODIDE_INTEGRITY)throw new Error('Python runtime lock integrity mismatch');
  const pkg=JSON.parse(await fs.readFile(path.join(root,'node_modules/pyodide/package.json'),'utf8'));
  if(pkg.version!==PYODIDE_VERSION)throw new Error('Installed Python version mismatch');
  await fs.mkdir(outDir,{recursive:true});
  const files=[];
  for(const name of RUNTIME_FILES){
    const bytes=await fs.readFile(path.join(root,'node_modules/pyodide',name));
    await fs.writeFile(path.join(outDir,name),bytes);
    files.push({name,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')});
  }
  const manifest={version:PYODIDE_VERSION,integrity:PYODIDE_INTEGRITY,files,totalBytes:files.reduce((n,f)=>n+f.bytes,0),licenses:[{name:'Pyodide',license:pkg.license,url:'https://github.com/pyodide/pyodide/blob/0.29.3/LICENSE'},{name:'CPython',license:'Python-2.0',url:'https://docs.python.org/3/license.html'}]};
  await fs.writeFile(path.join(outDir,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
  return manifest;
}
if(process.argv[1]===fileURLToPath(import.meta.url)){const m=await bundlePython(process.argv[2]||path.join(root,'dist/extension/vendor/python'));console.log(`Bundled Python ${m.version}: ${m.totalBytes} bytes`);}
