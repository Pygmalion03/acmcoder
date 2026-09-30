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
  function syncNow({automatic=false}={}){if(automatic&&retry!==null&&state.state==='retrying')return Promise.resolve();cancelRetry();if(!active)active=run().finally(()=>{active=null;});return active;}
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
      let dailyRetryAt=Number(await store.getMeta('sync:dailyRunRetryAt')||0);
      while(!paused){
        const mutations=await store.syncStage({skipNewRuns:dailyRetryAt>clock()});if(!mutations.length)break;
        const response=await transport.push(mutations);if(paused)return;
        await store.syncAcknowledge(response);
        if(response.errors?.length){
          const other=response.errors.find(e=>e.code!=='DAILY_RUN_LIMIT');
          if(other){const error=new Error(other.code);error.code=other.code;throw error;}
          const quota=response.errors[0];
          if(!Number.isFinite(quota.retryAt)||quota.retryAt<=clock())throw new Error('INVALID_QUOTA_RETRY');
          dailyRetryAt=quota.retryAt;await store.setMeta('sync:dailyRunRetryAt',dailyRetryAt);
        }
      }
      if(paused)return;
      await pull();
      const conflicts=await store.syncConflicts();
      if(dailyRetryAt>clock()){
        failures=0;status({state:'quota',code:'DAILY_RUN_LIMIT',nextRetryAt:dailyRetryAt,conflicts:conflicts.length});
        retry=schedule(()=>{retry=null;return syncNow();},dailyRetryAt-clock());retry?.unref?.();return;
      }
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
