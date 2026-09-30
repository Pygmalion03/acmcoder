import {normalizeDraft} from '/shared/practice.js';
export async function createLocalClient(){
  const token=(await fetch('/api/session').then(r=>r.json())).token;
  async function call(operation,data){const response=await fetch(`/api/unified/${operation}`,{method:data?'POST':'GET',headers:data?{'content-type':'application/json','x-acmcoder-token':token}:{},...(data?{body:JSON.stringify(data)}:{})});const result=await response.json();if(!response.ok)throw Object.assign(new Error(result.error||'本地服务暂不可用'),{code:result.code});return result.result;}
  return {call,store(namespace){
    const listeners=new Set();const journal=`acmcoder-local-recovery:${namespace}`;let queue=Promise.resolve();let pending=new Map();let state={state:'saved'};
    const write=()=>pending.size?localStorage.setItem(journal,JSON.stringify([...pending.values()])):localStorage.removeItem(journal);
    function perform(method,args){const result=queue.then(()=>call('store',{namespace,method,args}));queue=result.catch(()=>{});return result;}
    const methods=['getDraft','startRewrite','finishRewrite','discardRewrite','listAttempts','getRecord','listRecords','putRecord','getMeta','setMeta','archiveProblem','restoreProblem','deleteProblem','exportBackup','restoreBackup','syncConflicts','syncResolve','syncCopyConflict'];
    const store={namespace,subscribe:fn=>{listeners.add(fn);return()=>listeners.delete(fn);},getSaveState:()=>state};
    for(const method of methods)store[method]=(...args)=>perform(method,args);
    store.saveDraft=async input=>{
      const draft=normalizeDraft(input);pending.set(draft.id,draft);write();state={state:'saving'};
      try{const result=await perform('saveDraft',[draft]);if(pending.get(draft.id)===draft)pending.delete(draft.id);write();state={state:'saved'};for(const listener of listeners)listener();return result;}
      catch(error){state={state:'error',error:error.message};throw error;}
    };
    store.flush=async()=>{await queue;await perform('flush',[]);if(state.state==='error')throw new Error(state.error);};
    store.recover=async()=>{const raw=localStorage.getItem(journal);if(raw)for(const draft of JSON.parse(raw))await store.saveDraft(draft);};
    return store;
  }};
}
