import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import {build} from 'esbuild';
import {configureExtensionManifest} from '../scripts/extension-deployment.mjs';

test('self-hosted extension permissions use the configured exact origins and remove previous deployment access',async()=>{
 const source=JSON.parse(await fs.readFile(new URL('../extension/manifest.json',import.meta.url),'utf8'));
 const manifest=configureExtensionManifest(source,{cloudOrigin:'https://sync.example.org',websiteOrigins:['https://practice.example.org','https://sync.example.org']});
 assert.deepEqual(manifest.host_permissions,['https://leetcode.cn/*','https://leetcode.com/*','http://127.0.0.1:43117/*','https://sync.example.org/*','https://practice.example.org/*']);
 assert.deepEqual(manifest.content_scripts.find(s=>s.js.includes('website-bridge.js')).matches,['https://practice.example.org/*','https://sync.example.org/*']);
 assert.deepEqual(manifest.optional_host_permissions,source.optional_host_permissions);
 assert.notDeepEqual(manifest.host_permissions,source.host_permissions);
});

test('classic website bridge bundles without module imports and ignores unrelated origins',async()=>{
 const bundle=await build({entryPoints:['extension/website-bridge.js'],bundle:true,format:'iife',platform:'browser',write:false});
 let listeners=0;
 const context={location:{origin:'https://unrelated.example.org'},URL,window:{addEventListener(){listeners++;}}};
 vm.runInNewContext(bundle.outputFiles[0].text,context);
 assert.equal(listeners,0);
});
