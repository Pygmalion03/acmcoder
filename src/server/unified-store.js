import fs from 'node:fs/promises';
import path from 'node:path';
import {createBrowserStore} from '../../shared/browser-store.js';

// Implements the small transaction interface used by the shared PracticeStore.
// Practice/rewrite/sync rules stay in shared; only durable storage changes here.
export function createFileDatabaseFactory({dataDir,beforeCommit=async()=>{}}){
  const databases=new Map();
  function requestValue(value){const request={result:structuredClone(value)};queueMicrotask(()=>request.onsuccess?.());return request;}
  async function atomic(file,value){
    const temporary=`${file}.${crypto.randomUUID()}.tmp`,journal=`${file}.journal`;
    await fs.mkdir(path.dirname(file),{recursive:true});
    try{
      const handle=await fs.open(temporary,'wx',0o600);
      try{await handle.writeFile(JSON.stringify(value));await handle.sync();}finally{await handle.close();}
      await beforeCommit({phase:'beforeJournal'});
      await fs.rename(temporary,journal);
      await beforeCommit({phase:'afterJournal'});
      await fs.rename(journal,file);
      const directory=await fs.open(path.dirname(file),'r');try{await directory.sync();}finally{await directory.close();}
    }finally{await fs.rm(temporary,{force:true});}
  }
  async function database(name){
    if(databases.has(name))return databases.get(name);
    const file=path.join(dataDir,Buffer.from(name).toString('base64url'),'state.json');
    const work=(async()=>{
      let state={version:0,stores:{}};
      try{const journal=JSON.parse(await fs.readFile(`${file}.journal`,'utf8'));if(!journal.stores||!journal.version)throw new Error('INVALID_RECOVERY_JOURNAL');await fs.rename(`${file}.journal`,file);}catch(error){if(error.code!=='ENOENT')throw error;}
      try{state=JSON.parse(await fs.readFile(file,'utf8'));if(!state.stores||!state.version)throw new Error('INVALID_LOCAL_STORE');}catch(error){if(error.code!=='ENOENT')throw error;}
      const db={
        get version(){return state.version;},get objectStoreNames(){return {contains:name=>Object.hasOwn(state.stores,name)};},
        createObjectStore(name,{keyPath}={}){state.stores[name]={keyPath,rows:{}};},close(){},
        transaction(names,mode){
          const next=structuredClone(state),tx={error:null};let finished=false;
          const writable=mode==='readwrite';
          tx.abort=()=>{if(finished)return;finished=true;queueMicrotask(()=>tx.onabort?.());};
          tx.objectStore=name=>{
            if(!names.includes(name)||!next.stores[name])throw new Error('UNKNOWN_LOCAL_TABLE');
            const table=next.stores[name],key=value=>JSON.stringify(value);
            const write=(value,explicit,add)=>{
              if(!writable||finished)throw new Error('INACTIVE_LOCAL_TRANSACTION');
              const id=explicit??(Array.isArray(table.keyPath)?table.keyPath.map(k=>value[k]):value[table.keyPath]);
              if(id===undefined)throw new Error('INVALID_LOCAL_KEY');
              if(add&&Object.hasOwn(table.rows,key(id)))throw new Error('DUPLICATE_LOCAL_KEY');
              table.rows[key(id)]=structuredClone(value);return requestValue(id);
            };
            return {get:id=>requestValue(table.rows[key(id)]),getAll:()=>requestValue(Object.values(table.rows)),put:(value,id)=>write(value,id,false),add:(value,id)=>write(value,id,true),delete(id){if(!writable||finished)throw new Error('INACTIVE_LOCAL_TRANSACTION');delete table.rows[key(id)];return requestValue(undefined);}};
          };
          // Shared work schedules all its requests through promise microtasks.
          setImmediate(async()=>{
            if(finished)return;
            try{if(writable){await atomic(file,next);state=next;}finished=true;tx.oncomplete?.();}
            catch(error){tx.error=error;finished=true;tx.onabort?.();}
          });
          return tx;
        }
      };
      return {db,upgrade:version=>{state.version=version;}};
    })();
    databases.set(name,work);return work;
  }
  return {open(name,version){
    const request={};database(name).then(({db,upgrade})=>{request.result=db;if(db.version<version){upgrade(version);request.onupgradeneeded?.();}request.onsuccess?.();},error=>{request.error=error;request.onerror?.();});return request;
  }};
}
export function createLocalStore({dataDir,namespace='local-guest',sync=false,beforeCommit}={}){
  if(!dataDir)throw new Error('LOCAL_DATA_DIRECTORY_REQUIRED');
  return createBrowserStore({namespace,indexedDB:createFileDatabaseFactory({dataDir,beforeCommit}),storage:null,sync});
}
