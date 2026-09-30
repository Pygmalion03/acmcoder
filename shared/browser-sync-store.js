import {copyProblemRecords} from './copy-problem.js';
import {validateRecord} from './records.js';
const value=request=>new Promise((resolve,reject)=>{request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});
const key=r=>`${r.kind}:${r.id}`;
const same=(a,b)=>a?.deleted&&b?.deleted||JSON.stringify(a?.payload??null)===JSON.stringify(b?.payload??null)&&a?.problemId===b?.problemId&&a?.language===b?.language&&!!a?.deleted===!!b?.deleted;
export function toSyncRecord(table,row){
  if(table==='records')return row;
  const {id,problemId,language}=row;
  const payload=table==='drafts'?{code:row.code,stdin:row.stdin,expected:row.expected,mode:row.mode,previousAttemptId:row.previousAttemptId??null}:{code:row.code,stdin:row.stdin,expected:row.expected,reason:row.reason,createdAt:row.createdAt};
  return {kind:table==='drafts'?'draft':'attempt',id,problemId,language,payload,revision:0,syncEpoch:row.syncEpoch||0,updatedAt:row.updatedAt||row.createdAt};
}
function mutation(entry){
  const r=entry.local;
  if(!r||same(r,entry.base)||(r.deleted&&!entry.base))return null;
  return {mutationId:crypto.randomUUID(),kind:r.kind,id:r.id,op:r.deleted?'delete':'put',baseRevision:entry.base?.revision||0,...(!r.deleted?{payload:r.payload,...(r.problemId?{problemId:r.problemId}:{}),...(r.language?{language:r.language}:{})}:{})};
}
export function createBrowserSyncAdapter({transaction,read,enqueue}){
  const tables=['records','drafts','attempts','meta','sync'];
  async function track(s,changes){
    for(const record of changes.values()){
      const entry=await value(s('sync').get(key(record)))||{base:null,inflight:null,conflict:null};
      entry.local=record;
      if(entry.conflict)entry.conflict.local=record;
      else if(record.kind==='draft'&&(record.syncEpoch||0)!==(entry.epoch||0))entry.conflict={local:record,remote:entry.base};
      entry.pending=entry.conflict?null:mutation(entry);s('sync').put(entry,key(record));
    }
  }
  function writeRemote(s,record,epoch=0){
    const table=record.kind==='draft'?'drafts':record.kind==='attempt'?'attempts':'records';
    const id=table==='records'?[record.kind,record.id]:record.id;
    if(record.deleted){s(table).delete(id);if(record.kind==='problem')s('meta').put({deletedAt:record.updatedAt},`deleted:${record.id}`);}
    else s(table).put(table==='records'?record:{...record.payload,id:record.id,problemId:record.problemId,language:record.language,updatedAt:record.updatedAt,syncEpoch:epoch});
  }
  async function problemRecords(s,problemId){
    const records=(await value(s('records').getAll())).filter(r=>r.kind==='problem'?r.id===problemId:r.problemId===problemId);
    for(const table of ['drafts','attempts'])for(const row of await value(s(table).getAll()))if(row.problemId===problemId)records.push(toSyncRecord(table,row));
    return records;
  }
  return {track,api:{
    syncStage:({skipNewRuns=false}={})=>enqueue(()=>transaction(['sync'],'readwrite',async s=>{
      const entries=await value(s('sync').getAll());
      const order=r=>r.kind==='problem'?0:r.kind==='attempt'?1:r.kind==='draft'?3:2;
      const eligible=entries.filter(e=>!e.conflict&&(e.inflight||e.pending)&&!(skipNewRuns&&e.local.kind==='run'&&!e.local.deleted)).sort((a,b)=>order(a.local)-order(b.local));
      // One request remains comfortably below the free D1 query limit.
      const selected=eligible.slice(0,1);
      for(const e of selected){e.inflight??=e.pending;s('sync').put(e,key(e.local));}
      return selected.map(e=>e.inflight);
    },false)),
    syncAcknowledge:result=>enqueue(()=>transaction(['sync'],'readwrite',async s=>{
      const entries=await value(s('sync').getAll());
      for(const e of entries){
        if(!e.inflight)continue;
        const applied=result.applied.find(a=>a.mutationId===e.inflight.mutationId);
        const conflict=result.conflicts.find(a=>a.mutationId===e.inflight.mutationId);
        if(applied){
          const sent=e.inflight;e.base={...sent,revision:applied.revision,deleted:sent.op==='delete',payload:sent.payload??null};e.inflight=null;e.pending=mutation(e);
        }else if(conflict){e.conflict={local:e.local,remote:conflict.current};e.inflight=null;e.pending=null;}
        s('sync').put(e,key(e.local));
      }
    },false)),
    syncPullPage:page=>enqueue(()=>transaction(tables,'readwrite',async s=>{
      // Keep a recovery bundle only when another device deletes a problem that
      // has unsynced local work. Clean it when the user resolves those conflicts.
      const entries=await value(s('sync').getAll());
      for(const record of page.changes)if(record.kind==='problem'&&record.deleted&&entries.some(e=>(e.local?.problemId===record.id||e.local?.kind==='problem'&&e.local.id===record.id)&&(e.conflict||!same(e.local,e.base)))){
        if(!await value(s('meta').get(`sync:recovery:${record.id}`)))s('meta').put(await problemRecords(s,record.id),`sync:recovery:${record.id}`);
      }
      for(const input of page.changes){
        const record=input.deleted?input:validateRecord(input);
        const id=key(record);let e=await value(s('sync').get(id));
        if(e?.base?.revision>=record.revision)continue;
        if(!e)e={base:null,local:null,pending:null,inflight:null,conflict:null};
        if(e.conflict){e.conflict.remote=record;e.base=record;}
        else if(e.inflight&&same({...e.inflight,deleted:e.inflight.op==='delete'},record)){
          e.base=record;e.inflight=null;e.pending=mutation(e);
        }
        else if(e.local&&!same(e.local,e.base)&&!same(e.local,record)){
          e.conflict={local:e.local,remote:record};e.base=record;e.pending=null;e.inflight=null;
          if(record.deleted)writeRemote(s,record);
        }else{if(!same(e.local,record)){e.epoch=(e.epoch||0)+1;writeRemote(s,record,e.epoch);}e.base=record;e.local=record;e.pending=null;e.inflight=null;}
        s('sync').put(e,id);
      }
      // Record changes and cursor commit together, including after a crash.
      s('meta').put(page.nextCursor,'sync:cursor');
    },false)),
    syncConflicts:()=>read(['sync'],async s=>(await value(s('sync').getAll())).filter(e=>e.conflict).map(e=>({key:key(e.local),...e.conflict}))),
    syncCopyConflict:id=>enqueue(()=>transaction(tables,'readwrite',async s=>{
      const entries=await value(s('sync').getAll()),selected=entries.find(e=>e.local&&key(e.local)===id);
      if(!selected?.conflict)throw new Error('冲突已处理。');
      const problemId=selected.local.kind==='problem'?selected.local.id:selected.local.problemId;
      if(!problemId)throw new Error('这项设置冲突无法另存为题目，请选择版本或导出。');
      const recovery=await value(s('meta').get(`sync:recovery:${problemId}`))||[];
      const group=new Map([...recovery,...await problemRecords(s,problemId)].map(r=>[key(r),r]));
      const related=entries.filter(e=>e.local?.kind==='problem'?e.local.id===problemId:e.local?.problemId===problemId);
      for(const e of related)if(e.conflict&&!e.conflict.local.deleted)group.set(key(e.local),e.conflict.local);
      const original=group.get(`problem:${problemId}`);
      if(!original)throw new Error('原题面无法恢复，请导出双方内容后手动导入。');
      const copied=copyProblemRecords([...group.values()],{problemId,titleSuffix:' · 冲突副本'}),newId=copied.problemId;
      const changes=new Map();
      for(const validated of copied.records){writeRemote(s,validated);changes.set(key(validated),validated);}
      // Copy and acceptance of the original cloud versions commit together.
      const deletedParent=related.some(e=>e.local.kind==='problem'&&(e.base?.deleted||e.conflict?.remote?.deleted));
      for(const e of related)if(e.conflict||deletedParent){
        const originalKey=key(e.local),old=e.local;e.base=e.conflict?.remote||e.base;e.local=e.base;e.conflict=null;e.inflight=null;e.pending=null;e.epoch=(e.epoch||0)+1;
        writeRemote(s,e.local||{kind:old.kind,id:old.id,problemId:old.problemId,deleted:true},e.epoch);s('sync').put(e,originalKey);
      }
      s('meta').delete(`sync:recovery:${problemId}`);await track(s,changes);
      return {problemId:newId,records:changes.size};
    },false)),
    syncResolve:(id,choice)=>enqueue(()=>transaction(tables,'readwrite',async s=>{
      const e=await value(s('sync').get(id));if(!e?.conflict)throw new Error('冲突已处理。');
      if(!['local','cloud'].includes(choice))throw new Error('请选择保留本地或云端版本。');
      const remote=e.conflict.remote;
      if(choice==='local'&&remote?.deleted)throw new Error('云端已彻底删除；请先导出冲突内容，再作为新题导入。');
      e.base=remote;e.local=choice==='local'?e.conflict.local:remote;e.conflict=null;e.inflight=null;e.pending=mutation(e);
      if(e.local){e.epoch=(e.epoch||0)+1;writeRemote(s,e.local,e.epoch);}else writeRemote(s,{...remote,...e,kind:id.split(':')[0],id:id.slice(id.indexOf(':')+1),deleted:true});
      s('sync').put(e,id);
      const problemId=e.local?.kind==='problem'?e.local.id:e.local?.problemId;
      if(problemId&&!(await value(s('sync').getAll())).some(item=>item.conflict&&(item.local.problemId===problemId||item.local.kind==='problem'&&item.local.id===problemId)))s('meta').delete(`sync:recovery:${problemId}`);
    },false)),
    syncPendingCount:()=>read(['sync'],async s=>(await value(s('sync').getAll())).filter(e=>e.pending||e.inflight).length)
  }};
}
