import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
const source=fs.readFileSync('extension/runner/bridge.js','utf8');
function sandbox(){
 const messages=[],workers=[];let receive;
 class FakeWorker{constructor(){workers.push(this);}postMessage(value){this.last=value;}terminate(){this.stopped=true;}}
 const parent={postMessage:(value,origin)=>messages.push({value,origin})};
 vm.runInNewContext(source,{location:{hash:'#nonce',protocol:'chrome-extension:',host:'trusted'},window:{parent,addEventListener:(name,fn)=>receive=fn},Worker:FakeWorker,Blob,URL:{createObjectURL:()=> 'blob:runner',revokeObjectURL(){}},ArrayBuffer});
 const resources=['pyodide.js','pyodide.asm.js','pyodide.asm.wasm','python_stdlib.zip','pyodide-lock.json'].map(name=>({name,bytes:new ArrayBuffer(1)}));
 const run={nonce:'nonce',kind:'run',id:'one',code:'print(1)',stdin:'',resources};
 return {messages,workers,parent,run,send:(data,origin='chrome-extension://trusted',eventSource=parent)=>receive({data,origin,source:eventSource})};
}
test('extension sandbox refuses wrong parent, origin, nonce and arbitrary resource requests',()=>{
 const s=sandbox();s.send(s.run,'https://evil.invalid');s.send(s.run,'chrome-extension://trusted',{});s.send({...s.run,nonce:'wrong'});s.send({...s.run,resources:[{name:'secret',bytes:new ArrayBuffer(1)}]});assert.equal(s.workers.length,0);
 s.send(s.run);assert.equal(s.workers.length,1);assert.equal(s.workers[0].last.code,'print(1)');assert.equal(s.workers[0].last.nonce,undefined);
});
test('extension cancellation is idempotent and late replies cannot replace a subsequent run',()=>{
 const s=sandbox();s.send(s.run);const first=s.workers[0];s.send({nonce:'nonce',kind:'stop'});s.send({nonce:'nonce',kind:'stop'});assert.equal(first.stopped,true);
 s.send({...s.run,id:'two'});first.onmessage({data:{id:'one',kind:'stdout',text:'old'}});assert.equal(s.messages.some(m=>m.value.text==='old'),false);
 s.workers[1].onmessage({data:{id:'two',kind:'complete'}});assert.equal(s.messages.at(-1).value.id,'two');assert.equal(s.workers[1].stopped,true);
});
