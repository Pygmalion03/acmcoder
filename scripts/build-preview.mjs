import fs from 'node:fs/promises';
import path from 'node:path';
const root=process.cwd();
const target=path.join(root,'dist/preview');
await fs.mkdir(path.join(target,'cloudflare'),{recursive:true});
for(const name of ['functions','lib','migrations'])await fs.cp(path.join(root,'cloudflare',name),path.join(target,'cloudflare',name),{recursive:true});
await fs.cp(path.join(root,'shared'),path.join(target,'shared'),{recursive:true});
await fs.writeFile(path.join(target,'cloudflare/wrangler.jsonc'),JSON.stringify({name:'acmcoder-unified-preview',pages_build_output_dir:'../../site',compatibility_date:'2026-09-30',d1_databases:[{binding:'DB',database_name:'acmcoder-unified-preview',database_id:'00000000-0000-0000-0000-000000000003',migrations_dir:'migrations'}]},null,2));
console.log('Prepared isolated local Pages preview (no production bindings).');
