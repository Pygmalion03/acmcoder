(() => {
  const channel='acmcoder-handoff-v1';
  const allowed=['https://acmcoder.pygmalion.top','https://acmcoder-unified-preview.pages.dev'];
  if(!allowed.includes(location.origin))return;
  window.addEventListener('message',async event=>{
    const data=event.data;
    if(event.source!==window||event.origin!==location.origin||data?.channel!==channel||!['consume','create'].includes(data.type)||typeof data.requestId!=='string')return;
    if(data.type==='create'&&!navigator.userActivation.isActive)return;
    try{
      const response=await chrome.runtime.sendMessage({type:`ACMCODER_HANDOFF_${data.type.toUpperCase()}`,nonce:data.nonce,records:data.records});
      window.postMessage({channel,type:'response',requestId:data.requestId,...response},location.origin);
    }catch(error){window.postMessage({channel,type:'response',requestId:data.requestId,ok:false,error:error.message},location.origin);}
  });
})();
