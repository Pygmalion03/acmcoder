import { normalizeDraft, draftId, snapshot } from './practice.js';
import { validateRecord } from './records.js';
import { normalizeBackup } from './backup.js';
import {createBrowserSyncAdapter,toSyncRecord} from './browser-sync-store.js';

const requestValue = request => new Promise((resolve,reject) => {
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error);
});

export function createBrowserStore({namespace,indexedDB = globalThis.indexedDB,storage = globalThis.localStorage,sync = false}) {
  if (typeof namespace !== 'string' || !namespace) throw new Error('INVALID_NAMESPACE');
  const journalKey = `acmcoder-v3-recovery:${namespace}`;
  let state = {state:'saved'};
  let queue = Promise.resolve();
  let pending = new Map();
  const listeners=new Set();
  const database = new Promise((resolve,reject) => {
    if (!indexedDB) { reject(new Error('此浏览器无法保存数据。')); return; }
    const open = indexedDB.open(`acmcoder-v3:${namespace}`,2);
    open.onupgradeneeded = () => {
      const db = open.result;
      if(!db.objectStoreNames.contains('drafts')){
      db.createObjectStore('drafts',{keyPath:'id'});
      db.createObjectStore('attempts',{keyPath:'id'});
      db.createObjectStore('records',{keyPath:['kind','id']});
      db.createObjectStore('meta');
      }
      if(!db.objectStoreNames.contains('sync'))db.createObjectStore('sync');
    };
    open.onsuccess = () => { open.result.onversionchange = () => open.result.close(); resolve(open.result); };
    open.onerror = () => reject(open.error);
    open.onblocked = () => { state={state:'error',error:'请关闭其他旧版页面后重试。'}; };
  });
  async function transaction(names,mode,work,tracking=true) {
    const db = await database;
    const tracked=sync&&tracking&&mode==='readwrite';
    const tx = db.transaction(tracked?[...new Set([...names,'sync'])]:names,mode);
    const changes=new Map();
    const raw=name=>tx.objectStore(name);
    const access=name=>{
      const table=raw(name);
      if(!tracked||!['records','drafts','attempts'].includes(name))return table;
      return new Proxy(table,{get(target,property){
        if(['put','add'].includes(property))return row=>{const record=toSyncRecord(name,row);changes.set(`${record.kind}:${record.id}`,record);return target[property](row);};
        if(property==='delete')return id=>{const kind=name==='records'?id[0]:name==='drafts'?'draft':'attempt';const rid=name==='records'?id[1]:id;changes.set(`${kind}:${rid}`,{kind,id:rid,deleted:true,payload:null,updatedAt:Date.now()});return target.delete(id);};
        const item=target[property];return typeof item==='function'?item.bind(target):item;
      }});
    };
    const done = new Promise((resolve,reject) => {
      tx.oncomplete = resolve;
      tx.onabort = () => reject(tx.error || new Error('保存事务已取消。'));
      tx.onerror = () => {};
    });
    try {
      const result = await work(access);
      if(tracked)await syncAdapter.track(raw,changes);
      await done;
      if(changes.size)for(const listener of listeners)listener();
      return result;
    } catch(error) {
      try { tx.abort(); } catch { /* transaction already ended */ }
      await done.catch(()=>{});
      throw error;
    }
  }
  const syncAdapter=createBrowserSyncAdapter({transaction,read,enqueue});
  function writeJournal() {
    if (pending.size) storage?.setItem(journalKey,JSON.stringify([...pending.values()]));
    else storage?.removeItem(journalKey);
  }
  const ready = (async () => {
    const raw = storage?.getItem(journalKey);
    if (raw) {
      const drafts = JSON.parse(raw).map(normalizeDraft);
      await transaction(['drafts'],'readwrite',async s => { for (const draft of drafts) s('drafts').put(draft); });
      writeJournal();
    }
  })();
  // Keep initialization rejection observable through every public operation.
  ready.catch(error=>{state={state:'error',error:error.message};});
  function enqueue(work) {
    state={state:'saving'};
    const operation=queue.then(()=>ready).then(work);
    queue=operation.then(()=>{state={state:'saved'};},error=>{state={state:'error',error:error.message};});
    return operation;
  }
  async function read(names,work) { await queue; await ready; return transaction(names,'readonly',work); }
  const getDraft = key => read(['drafts'],async s => (await requestValue(s('drafts').get(draftId(key)))) || null);
  function saveDraft(input) {
    let draft;
    try { draft=normalizeDraft(input); pending.set(draft.id,draft); writeJournal(); }
    catch(error) { state={state:'error',error:error.message}; return Promise.reject(error); }
    return enqueue(async () => {
      await transaction(['drafts'],'readwrite',async s=>{s('drafts').put(draft);});
      if (pending.get(draft.id) === draft) pending.delete(draft.id);
      writeJournal();
      return draft;
    });
  }
  function changeRewrite(key,action,template) {
    return enqueue(async () => {
      const result=await transaction(['drafts','attempts'],'readwrite',async s=>{
        const draft=await requestValue(s('drafts').get(draftId(key)));
        if (!draft) throw new Error('请先保存当前代码。');
        if (action === 'start') {
          if (draft.mode === 'rewrite') return draft;
          const previous=snapshot(draft,'before-rewrite');
          const next=normalizeDraft({...draft,code:template,mode:'rewrite',previousAttemptId:previous.id});
          s('attempts').add(previous); s('drafts').put(next); return next;
        }
        if (draft.mode !== 'rewrite') return draft;
        if (action === 'discard') {
          const previous=await requestValue(s('attempts').get(draft.previousAttemptId));
          if (!previous) throw new Error('原记录缺失，已保留当前代码。');
          const next=normalizeDraft({...previous,id:draft.id,mode:'normal',previousAttemptId:null});
          s('drafts').put(next); return next;
        }
        s('attempts').add(snapshot(draft,'completed-rewrite'));
        const next=normalizeDraft({...draft,mode:'normal'});
        s('drafts').put(next); return next;
      });
      return result;
    });
  }
  const allStores=['records','drafts','attempts','meta'];
  function archive(id,archivedAt) {
    return enqueue(()=>transaction(['records'],'readwrite',async s=>{
      const record=await requestValue(s('records').get(['problem',id]));
      if(!record)throw new Error('题目不存在。');
      record.payload.archivedAt=archivedAt;record.updatedAt=Date.now();s('records').put(record);return record;
    }));
  }
  return {
    namespace,getDraft,saveDraft,...syncAdapter.api,
    subscribe:listener=>{listeners.add(listener);return ()=>listeners.delete(listener);},
    startRewrite:({template,...key})=>changeRewrite(key,'start',template),
    discardRewrite:key=>changeRewrite(key,'discard'),
    finishRewrite:key=>changeRewrite(key,'finish'),
    listAttempts:({problemId,language,cursor=null,limit=50})=>read(['attempts'],async s=>{
      const all=(await requestValue(s('attempts').getAll())).filter(row=>row.problemId === problemId && (!language || row.language === language)).sort((a,b)=>b.createdAt-a.createdAt || b.id.localeCompare(a.id));
      const offset=cursor ? all.findIndex(row=>row.id === cursor)+1 : 0;
      const items=all.slice(offset,offset+limit);
      return {items,nextCursor:offset+limit<all.length ? items.at(-1).id : null};
    }),
    getRecord:({kind,id})=>read(['records'],async s=>(await requestValue(s('records').get([kind,id]))) || null),
    listRecords:({kind}={})=>read(['records'],async s=>(await requestValue(s('records').getAll())).filter(row=>!kind || row.kind===kind)),
    putRecord:record=>enqueue(async()=>{const validated=validateRecord(record);await transaction(['records'],'readwrite',async s=>{s('records').put(validated);});return validated;}),
    getMeta:key=>read(['meta'],s=>requestValue(s('meta').get(key))),
    setMeta:(key,value)=>enqueue(()=>transaction(['meta'],'readwrite',async s=>{s('meta').put(value,key);})),
    archiveProblem:id=>archive(id,Date.now()),
    restoreProblem:id=>archive(id,null),
    deleteProblem:(id,{confirmed}={})=>enqueue(async()=>{
      if(confirmed!==true)throw new Error('需要明确确认彻底删除。');
      await transaction(allStores,'readwrite',async s=>{
        const records=await requestValue(s('records').getAll());
        for(const record of records)if(record.problemId===id || (record.kind==='problem'&&record.id===id))s('records').delete([record.kind,record.id]);
        for(const name of ['drafts','attempts'])for(const row of await requestValue(s(name).getAll()))if(row.problemId===id)s(name).delete(row.id);
        s('meta').put({deletedAt:Date.now()},`deleted:${id}`);
      });
    }),
    exportBackup:()=>read(allStores,async s=>{
      const records=await requestValue(s('records').getAll());
      for(const draft of await requestValue(s('drafts').getAll()))records.push({kind:'draft',id:draft.id,problemId:draft.problemId,language:draft.language,revision:0,updatedAt:draft.updatedAt,payload:{code:draft.code,stdin:draft.stdin,expected:draft.expected,mode:draft.mode,previousAttemptId:draft.previousAttemptId}});
      for(const attempt of await requestValue(s('attempts').getAll()))records.push({kind:'attempt',id:attempt.id,problemId:attempt.problemId,language:attempt.language,revision:0,updatedAt:attempt.createdAt,payload:{code:attempt.code,stdin:attempt.stdin,expected:attempt.expected,reason:attempt.reason,createdAt:attempt.createdAt}});
      return {version:3,exportedAt:new Date().toISOString(),records};
    }),
    restoreBackup:(backup,{mode='merge'}={})=>enqueue(async()=>{
      if(mode!=='merge')throw new Error('仅支持合并恢复。');
      const records=normalizeBackup(backup).records;
      const ids=new Set(records.filter(r=>r.kind==='problem').map(r=>r.id));
      return transaction(allStores,'readwrite',async s=>{
        const result={imported:0,conflicts:[],skipped:0};
        for(const record of records){
          const previousId=record.kind==='draft'&&record.payload.previousAttemptId;
          if(previousId){
            const previous=records.find(r=>r.kind==='attempt'&&r.id===previousId)||await requestValue(s('attempts').get(previousId));
            if(!previous||previous.problemId!==record.problemId||previous.language!==record.language)throw new Error('备份缺失匹配的重写快照。');
          }
        }
        for(const record of records){
          if(record.problemId&&!ids.has(record.problemId)&&!await requestValue(s('records').get(['problem',record.problemId])))throw new Error('备份包含缺失题目的记录。');
          const problemId=record.kind==='problem'?record.id:record.problemId;
          if(problemId&&await requestValue(s('meta').get(`deleted:${problemId}`))){result.conflicts.push({kind:record.kind,id:record.id,reason:'deleted'});continue;}
          const table=record.kind==='draft'?'drafts':record.kind==='attempt'?'attempts':'records';
          const key=table==='records'?[record.kind,record.id]:record.id;
          const value=table==='records'?record:{...record.payload,id:record.id,problemId:record.problemId,language:record.language,updatedAt:record.updatedAt};
          const existing=await requestValue(s(table).get(key));
          if(existing){
            const comparable=item=>table==='records'?item.payload:{code:item.code,stdin:item.stdin,expected:item.expected,mode:item.mode,reason:item.reason,previousAttemptId:item.previousAttemptId};
            if(JSON.stringify(comparable(existing))===JSON.stringify(comparable(value)))result.skipped++;
            else result.conflicts.push({kind:record.kind,id:record.id,current:existing,incoming:value});
          }else{s(table).add(value);result.imported++;}
        }
        return result;
      });
    }),
    flush:async()=>{await queue;if(state.state==='error')throw new Error(state.error);},
    getSaveState:()=>({...state})
  };
}
