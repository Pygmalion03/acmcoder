import fs from 'node:fs/promises';
import path from 'node:path';
import {createLocalStore} from './unified-store.js';
import {createCloudAuth} from './cloud-auth.js';
import {withoutCredentials} from '../../shared/backup.js';
import {createSyncEngine} from '../../shared/sync.js';

const methods=new Set(['getDraft','saveDraft','startRewrite','finishRewrite','discardRewrite','listAttempts','getRecord','listRecords','putRecord','getMeta','setMeta','archiveProblem','restoreProblem','deleteProblem','exportBackup','restoreBackup','flush','syncConflicts','syncResolve']);
export function createUnifiedApi({dataDir,credentialDir,memoryFile,cloudFetch}){
  const stores=new Map(),engines=new Map(),timers=new Map(),subscriptions=new Map();
  const auth=createCloudAuth({credentialDir,fetch:cloudFetch});let migration=null;
  function bindEngine(namespace,store){
    engines.get(namespace)?.pause();subscriptions.get(namespace)?.();clearTimeout(timers.get(namespace));
    const accountId=namespace.slice(8),call=(p,d)=>auth.fetch(p,d,accountId);
    const engine=createSyncEngine({store,accountId,transport:{async migrate(){let cursor=null;do{({nextCursor:cursor}=await call('records/migrate',{protocolVersion:1,cursor}));}while(cursor);},push:mutations=>call('sync/push',{protocolVersion:1,mutations}),pull:cursor=>call(`sync/pull?cursor=${cursor}&limit=50`)}});
    engines.set(namespace,engine);subscriptions.set(namespace,store.subscribe(()=>{clearTimeout(timers.get(namespace));const timer=setTimeout(()=>engine.syncNow(),1500);timer.unref();timers.set(namespace,timer);}));
  }
  async function getStore(namespace){
    if(!stores.has(namespace)){
      const store=createLocalStore({dataDir,namespace,sync:namespace.startsWith('account:')});stores.set(namespace,store);
      if(namespace.startsWith('account:'))bindEngine(namespace,store);
    }
    return stores.get(namespace);
  }
  async function migrate(){
    const store=await getStore('local-guest');if(await store.getMeta('legacy-file-migrated'))return;
    if(memoryFile){
      let raw;try{raw=await fs.readFile(memoryFile,'utf8');}catch(error){if(error.code!=='ENOENT')throw error;}
      if(raw){
        const backup=path.join(dataDir,'legacy-originals');await fs.mkdir(backup,{recursive:true});
        try{await fs.writeFile(path.join(backup,'pages.jsonl'),raw,{flag:'wx'});}catch(error){if(error.code!=='EEXIST')throw error;}
        const records=raw.split('\n').filter(Boolean).map(line=>JSON.parse(line)).filter(p=>p.slug&&p.content).map((p,index)=>({kind:'problem',id:`legacy-page-${index}`,payload:{title:String(p.title||p.slug).slice(0,160),statement:String(p.content).replace(/<\/(p|div|li|pre)>/gi,'\n').replace(/<[^>]*>/g,'').slice(0,100000),sourceUrl:p.url||'',sourceKind:'legacy',tags:p.tags||[],rawSamples:p.sample?[`${p.sample.inputText||''}\n${p.sample.outputText||''}`]:[],legacySlug:p.slug,legacyPage:withoutCredentials(p)}}));
        const result=await store.restoreBackup({version:3,records});if(result.conflicts.length)await store.setMeta('legacy-file-conflicts',result.conflicts);
      }
    }
    await store.setMeta('legacy-file-migrated',true);
  }
  return {async handle(operation,data={}){
    if(!migration)migration=migrate().catch(error=>{migration=null;throw error;});await migration;
    if(operation==='session'){const session=await auth.status();return {...session,namespace:session.user?`account:${session.user.id}`:'local-guest'};}
    if(operation==='connect')return auth.start();
    if(operation==='poll'){const result=await auth.poll();if(result.state==='connected'){const namespace=`account:${result.user.id}`;bindEngine(namespace,await getStore(namespace));}return result;}
    if(operation==='cancel'){auth.cancel();return {ok:true};}
    if(operation==='disconnect'){
      for(const engine of engines.values())engine.pause();for(const timer of timers.values())clearTimeout(timer);
      await auth.disconnect();return {ok:true};
    }
    const session=await auth.status(),allowed=session.user?`account:${session.user.id}`:'local-guest';
    if(data.namespace!=='local-guest'&&data.namespace!==allowed){const error=new Error('账号已切换，请刷新；原草稿保留。');error.code='account_changed';throw error;}
    const store=await getStore(data.namespace);
    if(operation==='sync'){
      const engine=engines.get(data.namespace);if(!engine)throw new Error('请先连接账号。');await engine.syncNow();return engine.getStatus();
    }
    if(operation==='store'){
      if(!methods.has(data.method)||!Array.isArray(data.args))throw new Error('INVALID_STORE_METHOD');
      return (await store[data.method](...data.args))??null;
    }
    throw new Error('UNKNOWN_UNIFIED_OPERATION');
  }};
}
