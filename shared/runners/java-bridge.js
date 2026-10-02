const nonce=location.hash.slice(1),parentOrigin=`${location.protocol}//${location.host}`;
let worker,current;
const send=data=>parent.postMessage({...data,nonce},parentOrigin);
function stop(){worker?.terminate();worker=null;current=null;}
addEventListener('message',event=>{
  if(event.source!==parent||event.origin!==parentOrigin||event.data?.nonce!==nonce)return;
  const data=event.data;if(data.kind==='stop'){stop();return;}
  if(data.kind!=='run'||typeof data.id!=='string'||typeof data.code!=='string'||data.code.length>200000||typeof data.stdin!=='string'||data.stdin.length>200000)return;
  if(!Array.isArray(data.resources)||data.resources.length<2||data.resources.length>80||data.resources[0]?.name!=='worker.js'||data.resources.some(r=>!(r.bytes instanceof ArrayBuffer))){send({kind:'error',id:data.id,text:'Java 运行资源不完整。'});return;}
  stop();current=data.id;
  const url=URL.createObjectURL(new Blob([data.resources[0].bytes],{type:'text/javascript'}));
  try{worker=new Worker(url);}catch(error){send({kind:'error',id:data.id,text:String(error)});URL.revokeObjectURL(url);return;}
  URL.revokeObjectURL(url);
  worker.onmessage=({data:reply})=>{if(current!==data.id||reply.id!==data.id||!['compiling','running','stdout','stderr','complete','error'].includes(reply.kind))return;send(reply);if(['complete','error'].includes(reply.kind))stop();};
  worker.onerror=event=>{if(current===data.id)send({kind:'error',id:data.id,text:event.message||'Java 启动失败。'});stop();};
  const resources=data.resources.slice(1);
  worker.postMessage({id:data.id,code:data.code,stdin:data.stdin,resources},resources.map(resource=>resource.bytes));
});
send({kind:'ready'});
