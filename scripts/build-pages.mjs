import fs from 'node:fs/promises';
import './build-clients.mjs';
await fs.mkdir('functions/api',{recursive:true});
await fs.writeFile('functions/api/[[path]].js',"export { onRequest } from '../../cloudflare/functions/api/[[path]].js';\n");
await fs.copyFile('dist/site/index.html','dist/site/legacy.html');
await fs.copyFile('dist/site/workspace.html','dist/site/index.html');
console.log('Prepared Pages root and Functions entry.');
