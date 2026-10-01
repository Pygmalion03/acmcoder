import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {inspectPagesArtifact} from './check-pages.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const output=path.join(root,'dist/site');
const workerDirectory=path.join(root,'dist/pages-worker');
execFileSync(process.execPath,[path.join(root,'scripts/build-clients.mjs'),'site'],{cwd:root,stdio:'inherit'});
await fs.copyFile(path.join(output,'index.html'),path.join(output,'legacy.html'));
await fs.copyFile(path.join(output,'workspace.html'),path.join(output,'index.html'));
// Compile only the API. Public compiler bytes stay in static assets, never in
// the Worker body; dashboard bindings and secrets are not read into this build.
await fs.rm(workerDirectory,{recursive:true,force:true});
await fs.mkdir(workerDirectory,{recursive:true});
execFileSync('npx',['--yes','wrangler@4.144.0','pages','functions','build',path.join(root,'cloudflare/functions'),
  '--outdir',workerDirectory,'--output-routes-path',path.join(output,'_routes.json'),
  '--minify','--compatibility-date','2026-09-30'],{cwd:root,stdio:'inherit',env:{...process.env,WRANGLER_SEND_METRICS:'false'}});
await fs.copyFile(path.join(workerDirectory,'index.js'),path.join(output,'_worker.js'));
const receipt=await inspectPagesArtifact(output);
await fs.mkdir(path.join(root,'dist/pages-build'),{recursive:true});
await fs.writeFile(path.join(root,'dist/pages-build/manifest.json'),JSON.stringify(receipt,null,2)+'\n');
console.log(`Prepared Pages ${receipt.version} ${receipt.commit}: ${receipt.assets.count} static files; API Worker ${receipt.worker.bytes} bytes.`);
