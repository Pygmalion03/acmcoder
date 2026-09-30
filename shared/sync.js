export function createSyncTransport({accountId,fetch:request=globalThis.fetch}){
  async function call(path,body){
    const response=await request(`/api/${path}`,{method:body?'POST':'GET',credentials:'same-origin',headers:{'x-acm-expected-user':accountId,...(body?{'content-type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
    const data=await response.json();
    if(!response.ok){const error=new Error(data.error||'云端暂不可用');error.code=data.code||String(response.status);throw error;}
    return data;
  }
  return {async migrate(){let cursor=null;do{({nextCursor:cursor}=await call('records/migrate',{protocolVersion:1,cursor}));}while(cursor);},push:mutations=>call('sync/push',{protocolVersion:1,mutations}),pull:cursor=>call(`sync/pull?cursor=${cursor}&limit=50`)};
}
export function createSyncEngine({store,transport,accountId,onStatus=()=>{},clock=()=>Date.now(),setTimeout:schedule=globalThis.setTimeout,clearTimeout:unschedule=globalThis.clearTimeout}){
  if(store.namespace!==`account:${accountId}`)throw new Error('ACCOUNT_NAMESPACE_MISMATCH');
  let paused=false,active=null,migrated=false,retry=null,failures=0;
  let state={state:'idle'};
  const status=value=>{state=value;onStatus(value);};
  const cancelRetry=()=>{if(retry!==null)unschedule(retry);retry=null;};
  function syncNow({automatic=false}={}){if(automatic&&retry!==null)return Promise.resolve();cancelRetry();if(!active)active=run().finally(()=>{active=null;});return active;}
  async function pull(){
    let cursor=await store.getMeta('sync:cursor')||0,more;
    do{if(paused)return;const page=await transport.pull(cursor);if(paused)return;await store.syncPullPage(page);cursor=page.nextCursor;more=page.hasMore;}while(more);
  }
  async function run(){
    if(paused)return;
    try{
      status({state:'syncing'});
      if(!migrated){await transport.migrate();migrated=true;}
      await pull();
      while(!paused){
        const mutations=await store.syncStage();if(!mutations.length)break;
        const response=await transport.push(mutations);if(paused)return;
        await store.syncAcknowledge(response);
        if(response.errors?.length){const error=new Error(response.errors[0].code);error.code=response.errors[0].code;throw error;}
      }
      if(paused)return;
      await pull();
      const conflicts=await store.syncConflicts();
      failures=0;status({state:conflicts.length?'conflict':'saved',conflicts:conflicts.length});
    }catch(error){
      if(paused)return;
      if(['401','account_changed','UPGRADE_REQUIRED'].includes(error.code)){paused=true;status({state:'paused',code:error.code,error:error.message});return;}
      const temporary=!error.code||['408','429','500','502','503','504'].includes(error.code);
      if(!temporary){status({state:'error',code:error.code,error:error.message});return;}
      const delay=Math.min(300000,5000*2**Math.min(failures++,6));
      status({state:'retrying',code:error.code,error:error.message,nextRetryAt:clock()+delay});
      retry=schedule(()=>{retry=null;return syncNow();},delay);retry?.unref?.();
    }
  }
  return {syncNow,pause(){paused=true;cancelRetry();status({state:'paused'});},getStatus:()=>({...state})};
}
