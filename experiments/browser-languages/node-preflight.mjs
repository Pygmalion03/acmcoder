// Compiler-chain preflight only. This is NOT browser/extension acceptance.
import { Worker } from 'node:worker_threads';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
const directory = resolve(process.argv[2]);
const workerURL = pathToFileURL(resolve(directory, 'cpp/worker.js')).href;
const bootstrap = `import {parentPort} from 'node:worker_threads';
import {readFile} from 'node:fs/promises';
globalThis.fetch=async(url)=>({ok:true,arrayBuffer:async()=>{const b=await readFile(url);return b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength)}});
globalThis.postMessage=(value)=>parentPort.postMessage(value);
globalThis.onmessage=null;
await import(${JSON.stringify(workerURL)});
parentPort.on('message',data=>globalThis.onmessage({data}));`;
const worker = new Worker(new URL('data:text/javascript,' + encodeURIComponent(bootstrap)));
let pending, index = 0;
worker.on('message', (value) => {
  if (value.type === 'phase') console.error('Phase: ' + value.phase);
  if (value.type === 'result') pending?.(value);
});
worker.on('error', (error) => pending?.({ error: error.message }));
function run(code, stdin = '') {
  return new Promise((resolvePromise) => {
    const timeout = setTimeout(() => { resolvePromise({ error: 'preflight-deadline' }); worker.terminate(); }, 60000);
    pending = (value) => { clearTimeout(timeout); pending = null; resolvePromise(value); };
    worker.postMessage({ id: ++index, code, stdin });
  });
}
try {
  const basic = '#include <iostream>\n#include <vector>\n#include <string>\n#include <map>\n#include <algorithm>\nint main(){int n;std::cin>>n;std::vector<int>a(n);for(auto &x:a)std::cin>>x;std::sort(a.begin(),a.end());std::map<std::string,int>m;m["结果"]=a.front()+a.back();std::cout<<"结果 "<<m["结果"]<<"\\n";}';
  const r = await run(basic, '4\n7 2 9 3\n');
  console.log(JSON.stringify({ environment: 'Node WASM compiler preflight; not browser', name: 'standard-libraries', ...r, passed: r.stdout?.trim() === '结果 11' }));
  if (!r.error) {
    const echo = await run('#include <iostream>\n#include <string>\nint main(){std::string s;while(std::getline(std::cin,s))std::cout<<s<<"\\n";}', '中文输入\n第二行🐍\n');
    console.log(JSON.stringify({ name: 'unicode', ...echo, passed: echo.stdout?.trim() === '中文输入\n第二行🐍' }));
    const bad = await run('int main(){ invalid syntax; }');
    console.log(JSON.stringify({ name: 'compile-error', ...bad, passed: bad.kind === 'CompileError' }));
    const memory = await run('#include <cstdlib>\n#include <cstdio>\nint main(){volatile char*p=(volatile char*)malloc(80*1024*1024);if(!p){puts("BOUNDED");return 0;}p[0]=1;p[80*1024*1024-1]=2;puts("UNBOUNDED");free((void*)p);}');
    console.log(JSON.stringify({ name: '64MiB-memory-bound', ...memory, passed: memory.stdout?.trim() === 'BOUNDED' }));
  }
} finally { await worker.terminate(); }
