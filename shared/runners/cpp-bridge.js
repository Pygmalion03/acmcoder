const nonce=location.hash.slice(1),parentOrigin=`${location.protocol}//${location.host}`;
const names=['clang22','lld22','memfs','sysroot22-standard.tar','worker.js'];
let worker=null,current=null;
const send=message=>window.parent.postMessage({...message,nonce},parentOrigin);
function stop(){worker?.terminate();worker=null;current=null;}
window.addEventListener('message',event=>{
  if(event.source!==window.parent||event.origin!==parentOrigin||event.data?.nonce!==nonce)return;
  const data=event.data;if(data.kind==='stop'){stop();return;}
  if(data.kind!=='run'||typeof data.id!=='string'||typeof data.code!=='string'||data.code.length>200000||typeof data.stdin!=='string'||data.stdin.length>200000)return;
  if(!Array.isArray(data.resources)||data.resources.length!==5||!data.resources.every((r,i)=>r.name===names[i]&&r.bytes instanceof ArrayBuffer))return;
  stop();current=data.id;
  const url=URL.createObjectURL(new Blob([data.resources[4].bytes],{type:'text/javascript'}));
  try{worker=new Worker(url);}catch(error){send({kind:'error',id:data.id,text:String(error)});URL.revokeObjectURL(url);return;}
  URL.revokeObjectURL(url);
  worker.onmessage=({data:reply})=>{if(current!==data.id||reply.id!==data.id||!['compiling','running','stdout','stderr','complete','error'].includes(reply.kind))return;send(reply);if(['complete','error'].includes(reply.kind))stop();};
  worker.onerror=event=>{if(current===data.id)send({kind:'error',id:data.id,text:event.message||'C++ 启动失败。'});stop();};
  worker.postMessage({id:data.id,code:data.code,stdin:data.stdin,resources:data.resources.slice(0,4)});
});
send({kind:'ready'});
