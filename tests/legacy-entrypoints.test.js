import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

for(const [file,origin,controls] of [
  ['web/index.html','http://127.0.0.1:43117',['export-problems','catalog-export','runner']],
  ['cloudflare/public/index.html','https://practice.example.test',['export','open-restore','recommendation-export']],
  ['extension/sidebar.html','chrome-extension://test-extension',['memory-mode','open-local','runner']]
])test(`${file} retains legacy tools and links to the same installation's unified workspace`,async()=>{
  const html=await fs.readFile(file,'utf8');
  const notice=html.match(/<aside id="legacy-notice"[\s\S]*?<\/aside>/)?.[0];
  assert.ok(notice);assert.match(notice,/旧版兼容入口/);assert.match(html,/<title>ACMCoder · 旧版/);
  const link=notice.match(/<a href="([^"]+)" target="_blank" rel="noopener noreferrer">/);
  assert.ok(link,'the existing editor stays open while the new workspace opens');
  const from=new URL(file.startsWith('extension')?'/sidebar.html':'/legacy.html',origin),to=new URL(link[1],from);
  assert.equal(to.protocol,from.protocol);assert.equal(to.host,from.host);assert.equal(to.pathname,'/workspace.html');
  const style=html.match(/<link rel="stylesheet" href="([^"]*shared\/ui\/legacy\.css)"/);
  assert.ok(style);assert.equal(new URL(style[1],from).pathname,'/shared/ui/legacy.css');
  assert.ok((await fs.readFile('shared/ui/legacy.css','utf8')).includes('.legacy-notice'));
  for(const id of controls)assert.ok(html.includes(`id="${id}"`),`${id} remains available`);
  assert.doesNotMatch(notice,/<script|<form|http-equiv=/i);
});
