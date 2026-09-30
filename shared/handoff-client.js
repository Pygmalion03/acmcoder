const CHANNEL='acmcoder-handoff-v1';
export function createWebsiteHandoff({host=window,origin=location.origin}={}){
  const pending=new Map();
  host.addEventListener('message',event=>{
    const data=event.data;
    if(event.source!==host||event.origin!==origin||data?.channel!==CHANNEL||data.type!=='response')return;
    const entry=pending.get(data.requestId);if(!entry)return;
    clearTimeout(entry.timer);pending.delete(data.requestId);data.ok?entry.resolve(data.result):entry.reject(new Error(data.error||'插件接续失败。'));
  });
  function request(type,values={}){
    const requestId=crypto.randomUUID();
    return new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>{pending.delete(requestId);reject(new Error('未连接到 ACMCoder 插件。请安装完整插件，或用设置中的备份导入继续。'));},3000);
      pending.set(requestId,{resolve,reject,timer});host.postMessage({channel:CHANNEL,requestId,type,...values},origin);
    });
  }
  return {consume:nonce=>request('consume',{nonce}),send:records=>request('create',{records})};
}
