export function createBrowserRunner({frame,bridgeUrl='/runner/bridge.html',host=globalThis.window}) {
  let ready=false,active=null,loadingTimer=null,runTimer=null;
  const nonce=crypto.randomUUID();
  const send=data=>frame.contentWindow?.postMessage({...data,nonce},'*');
  const emit=data=>active?.onEvent({...data,type:data.kind,id:active.id});
  function finish(data) {
    clearTimeout(loadingTimer);clearTimeout(runTimer);
    if (!active) return;
    emit(data); const {resolve}=active;active=null;send({kind:'stop'});resolve(data);
  }
  function dispatch() {
    if (!active || !ready || active.sent) return;
    active.sent=true;
    send({kind:'run',id:active.id,code:active.code,stdin:active.stdin});
  }
  function onMessage(event) {
    if (event.source !== frame.contentWindow || event.origin !== 'null' || event.data?.nonce !== nonce) return;
    const data=event.data;
    if (data.kind==='ready') {ready=true;dispatch();return;}
    if (!active || data.id !== active.id) return;
    if (data.kind==='running') {
      clearTimeout(loadingTimer);
      runTimer=setTimeout(()=>finish({kind:'error',text:'运行超过 5 秒，已停止。'}),5000);
    }
    if (['complete','error'].includes(data.kind)) {finish(data);return;}
    if (['running','stdout','stderr'].includes(data.kind)) emit(data);
  }
  host.addEventListener('message',onMessage);
  frame.src=`${bridgeUrl}#${nonce}`;
  function cancel(id) { if(active?.id===id) finish({kind:'error',cancelled:true,text:'已停止运行。'}); }
  return {
    run({id,language,code,stdin,signal},onEvent) {
      if(language!=='python') return Promise.reject(new Error('此端暂只支持 Python。'));
      if(typeof code!=='string' || code.length>50000 || typeof stdin!=='string' || stdin.length>32000) return Promise.reject(new Error('代码或输入超过运行限制。'));
      if(active) cancel(active.id);
      let abort;
      const result=new Promise(resolve=>{
        active={id,code,stdin,onEvent,resolve,sent:false};
        emit({kind:'loading'});
        loadingTimer=setTimeout(()=>finish({kind:'error',text:'Python 加载超时，请检查网络后重试。'}),30000);
        abort=()=>cancel(id);
        if(signal?.aborted) abort();
        else {signal?.addEventListener('abort',abort,{once:true});dispatch();}
      });
      return result.finally(()=>signal?.removeEventListener('abort',abort));
    },cancel,
    destroy(){if(active)cancel(active.id);host.removeEventListener('message',onMessage);}
  };
}
