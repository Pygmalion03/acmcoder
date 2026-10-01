import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {inspectPagesArtifact} from './check-pages.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const output=path.join(root,'dist/site');
const metadataDirectory=path.join(root,'dist/pages-build');
execFileSync(process.execPath,[path.join(root,'scripts/build-clients.mjs'),'site'],{cwd:root,stdio:'inherit'});
await fs.copyFile(path.join(output,'index.html'),path.join(output,'legacy.html'));
await fs.copyFile(path.join(output,'workspace.html'),path.join(output,'index.html'));
// Compile only the API. Public compiler bytes stay in static assets, never in
// the Worker body; dashboard bindings and secrets are not read into this build.
await fs.mkdir(metadataDirectory,{recursive:true});
execFileSync('npx',['--yes','esbuild@0.28.1',path.join(root,'cloudflare/worker.js'),'--bundle','--format=esm',
  '--platform=neutral','--target=es2022','--minify',`--outfile=${path.join(output,'_worker.js')}`,
  `--metafile=${path.join(metadataDirectory,'esbuild-meta.json')}`],{cwd:root,stdio:'inherit'});
const graph=JSON.parse(await fs.readFile(path.join(metadataDirectory,'esbuild-meta.json'),'utf8'));
if(Object.values(graph.outputs).some(item=>item.imports.length))throw new Error('Pages Worker contains unresolved module imports');
const receipt=await inspectPagesArtifact(output);
await fs.writeFile(path.join(metadataDirectory,'manifest.json'),JSON.stringify(receipt,null,2)+'\n');
console.log(`Prepared Pages ${receipt.version} ${receipt.commit}: ${receipt.assets.count} static files; API Worker ${receipt.worker.bytes} bytes.`);
