// The sandbox receives only public runtime bytes, code and stdin. No extension APIs.
const nonce=globalThis.document?.documentElement?.dataset.runnerNonce||location.hash.slice(1);
const parentOrigin=globalThis.document?.documentElement?.dataset.parentOrigin||`${location.protocol}//${location.host}`;
let worker=null,current=null;
const source=String.raw`
let count=0,limited=false;
function output(kind,text,id){const room=32768-count;if(room<=0){limited=true;return;}text=String(text);const part=text.slice(0,room);count+=part.length;if(part.length<text.length)limited=true;postMessage({kind,text:part,id});}
onmessage=async({data})=>{
  const {id,code,stdin,resources}=data;
  try{
    const files=new Map(resources.map(r=>[r.name,r.bytes]));
    const root='https://runtime.invalid/';
    // A fixed in-memory resource map; never proxy arbitrary URLs to the parent.
    globalThis.fetch=async input=>{
      const url=String(input?.url??input);
      if(!url.startsWith(root)||!files.has(url.slice(root.length)))throw new Error('离线运行器不允许网络请求');
      const name=url.slice(root.length);return new Response(files.get(name),{headers:{'content-type':name.endsWith('.wasm')?'application/wasm':'application/octet-stream'}});
    };
    const scripts=['pyodide.js','pyodide.asm.js'].map(name=>URL.createObjectURL(new Blob([files.get(name)],{type:'text/javascript'})));
    importScripts(...scripts);scripts.forEach(url=>URL.revokeObjectURL(url));
    const pyodide=await loadPyodide({indexURL:root,lockFileContents:JSON.parse(new TextDecoder().decode(files.get('pyodide-lock.json')))});
    const lines=String(stdin).match(/[^\n]*\n|[^\n]+$/g)||[];
    pyodide.setStdin({stdin:()=>lines.shift()??null});
    pyodide.setStdout({batched:text=>output('stdout',text+'\n',id)});
    pyodide.setStderr({batched:text=>output('stderr',text+'\n',id)});
    postMessage({kind:'running',id});await pyodide.runPythonAsync(code);postMessage({kind:'complete',id,outputLimited:limited});
  }catch(error){postMessage({kind:'error',id,text:String(error)});}
};`;
const send=message=>window.parent.postMessage({...message,nonce},parentOrigin);
function stop(){worker?.terminate();worker=null;current=null;}
window.addEventListener('message',event=>{
  if(event.source!==window.parent||event.origin!==parentOrigin||event.data?.nonce!==nonce)return;
  const data=event.data;
  if(data.kind==='stop'){stop();return;}
  if(data.kind!=='run'||typeof data.id!=='string'||typeof data.code!=='string'||typeof data.stdin!=='string'||data.code.length>50000||data.stdin.length>32000)return;
  if(!Array.isArray(data.resources)||data.resources.length!==5)return;
  const names=['pyodide.js','pyodide.asm.js','pyodide.asm.wasm','python_stdlib.zip','pyodide-lock.json'];
  if(!data.resources.every((r,i)=>r.name===names[i]&&r.bytes instanceof ArrayBuffer))return;
  stop();current=data.id;
  const url=URL.createObjectURL(new Blob([source],{type:'text/javascript'}));
  try{worker=new Worker(url);}catch(error){send({kind:'error',id:data.id,text:String(error)});URL.revokeObjectURL(url);return;}
  URL.revokeObjectURL(url);
  worker.onmessage=({data:reply})=>{if(current!==data.id||reply.id!==data.id||!['running','stdout','stderr','complete','error'].includes(reply.kind))return;send(reply);if(['complete','error'].includes(reply.kind))stop();};
  worker.onerror=event=>{if(current===data.id)send({kind:'error',id:data.id,text:event.message||'本地 Python 启动失败'});stop();};
  worker.postMessage({id:data.id,code:data.code,stdin:data.stdin,resources:data.resources});
});
send({kind:'ready'});
