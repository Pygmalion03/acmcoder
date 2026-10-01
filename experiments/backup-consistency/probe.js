import {createBrowserStore} from './shared/browser-store.js';
import {normalizeBackup} from './shared/backup.js';

const status=document.querySelector('#status'),result=document.querySelector('#result');
const runButton=document.querySelector('#run'),exportButton=document.querySelector('#export');
let report=null;
const check=(condition,message)=>{if(!condition)throw new Error(message);};
const canonical=records=>JSON.stringify(records.map(r=>({kind:r.kind,id:r.id,payload:r.payload})).sort((a,b)=>`${a.kind}:${a.id}`.localeCompare(`${b.kind}:${b.id}`)));

// Intercepts only observation of real IndexedDB transaction creation. All reads,
// writes, serialization, and restoration use the unmodified product modules.
function observedFactory(onReadStart){
  return {open(...args){
    const request=indexedDB.open(...args);
    let wrappedDatabase;
    return new Proxy(request,{get(target,key){
      if(key==='result'){
        const db=target.result;
        if(!wrappedDatabase)wrappedDatabase=new Proxy(db,{get(database,property){
          if(property==='transaction')return (names,mode,...rest)=>{
            const tx=database.transaction(names,mode,...rest);
            if(mode==='readonly'&&Array.isArray(names)&&names.length===4)onReadStart(tx);
            return tx;
          };
          const value=Reflect.get(database,property,database);return typeof value==='function'?value.bind(database):value;
        },set(database,property,value){return Reflect.set(database,property,value,database);}});
        return wrappedDatabase;
      }
      const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value;
    },set(target,key,value){return Reflect.set(target,key,value,target);}});
  }};
}

runButton.addEventListener('click',async()=>{
  runButton.disabled=true;exportButton.disabled=true;status.textContent='初始化独立验收空间…';
  const startedAt=new Date().toISOString(),namespace=`backup-race-${crypto.randomUUID()}`;
  let onExport=null;
  try{
    const reader=createBrowserStore({namespace,indexedDB:observedFactory(tx=>onExport?.(tx)),storage:null});
    const writer=createBrowserStore({namespace,storage:null});
    const problemId='backup-fixture',key={problemId,language:'python'};
    const records=[{kind:'problem',id:problemId,payload:{title:'并发备份自建题',statement:'读取两个整数并输出和。',sourceKind:'manual'}},
      {kind:'plan',id:'old-plan',payload:{day:'2020-01-01',completed:{[problemId]:true}}},
      {kind:'conversation',id:'fixture-chat',problemId,language:'python',payload:{messages:[{role:'user',content:'保留中文历史'},{role:'assistant',content:'只用于离线验收。'}]}},
      ...Array.from({length:106},(_,i)=>({kind:'run',id:`old-run-${i}`,problemId,language:'python',updatedAt:1577836800000+i,payload:{status:'self_pass',stdout:String(i),stdin:`${i} 0\n`,expected:String(i),code:`print(${i})`}}))];
    await writer.restoreBackup({version:3,records});
    await writer.saveDraft({...key,code:'original',stdin:'2 -1\n',expected:'1\n'});
    await reader.getDraft(key);await writer.getDraft(key);
    const rounds=[];
    for(let round=0;round<20;round++){
      status.textContent=`第 ${round+1}/20 轮：导出事务打开后立即请求另一实例重写…`;
      const original=`# 原始记录 ${round} 中文\nprint(${round})\n`;
      await writer.saveDraft({...key,code:original,stdin:'2 -1\n',expected:'1\n'});
      const events=[];let rewrite;
      onExport=tx=>{
        onExport=null;events.push('export-transaction-open');
        tx.addEventListener('complete',()=>events.push('export-transaction-complete'));
        events.push('rewrite-requested-while-export-open');
        rewrite=writer.startRewrite({...key,template:`# 重写 ${round}\n`}).then(value=>{events.push('rewrite-complete');return value;});
      };
      const backup=await reader.exportBackup();check(rewrite,'没有实际触发并发重写');await rewrite;
      normalizeBackup(backup);
      const draft=backup.records.find(r=>r.kind==='draft');
      check(draft.payload.code===original&&draft.payload.mode==='normal','导出混入重写后的草稿');
      check(draft.payload.stdin==='2 -1\n'&&draft.payload.expected==='1\n','输入/期望未完整保留');
      check(backup.records.filter(r=>r.kind==='run').length===106,'历史被截断');
      check(events.indexOf('rewrite-requested-while-export-open')<events.indexOf('export-transaction-complete'),'写请求未与导出重叠');
      check(events.indexOf('export-transaction-complete')<events.indexOf('rewrite-complete'),'写入未等待导出事务结束');
      const current=await writer.getDraft(key);
      check(current.mode==='rewrite'&&current.code===`# 重写 ${round}\n`,'后续重写未实际写入');
      check((await writer.listAttempts({problemId})).items.some(a=>a.id===current.previousAttemptId&&a.code===original),'重写缺少关联原记录');
      await writer.finishRewrite(key);rounds.push({round:round+1,records:backup.records.length,events,status:'passed'});
    }
    const finalBackup=await reader.exportBackup();
    const restored=createBrowserStore({namespace:`${namespace}-restored`,storage:null});
    const restoreResult=await restored.restoreBackup(finalBackup);
    check(!restoreResult.conflicts.length,'新空间出现恢复冲突');
    const restoredBackup=await restored.exportBackup();
    check(canonical(finalBackup.records)===canonical(restoredBackup.records),'新空间恢复后记录不一致');
    check(restoredBackup.records.filter(r=>r.kind==='attempt').length===40,'重写前后快照未完整恢复');
    check(restoredBackup.records.find(r=>r.kind==='plan').payload.day==='2020-01-01','旧计划未完整恢复');
    report={schemaVersion:1,startedAt,completedAt:new Date().toISOString(),userAgent:navigator.userAgent,namespace,status:'passed',rounds,finalRecords:finalBackup.records.length,oldRuns:106,restoredSnapshots:40,restoredPayloadsEqual:true,boundaries:['Real native IndexedDB with two BrowserStore instances in one document','Synthetic fixture only; no user namespace, credential or cloud request','Not real cloud account export or a product UI editing test']};
    status.textContent='通过：20 轮并发导出，106 条旧自测、40 份重写快照、2020 年计划及聊天完整恢复。';
    result.textContent=JSON.stringify(report,null,2);exportButton.disabled=false;
  }catch(error){status.textContent=`失败：${error.message}`;result.textContent=error.stack||error.message;}
  finally{runButton.disabled=false;}
});
exportButton.addEventListener('click',()=>{
  const url=URL.createObjectURL(new Blob([JSON.stringify(report,null,2)+'\n'],{type:'application/json'}));
  const link=document.createElement('a');link.href=url;link.download='acmcoder-backup-concurrency.json';link.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
});
