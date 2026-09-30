import {validateRecord,recordBytes} from './records.js';
const NONCE=/^[0-9a-f]{32}$/;
export const HANDOFF_ORIGINS=['https://acmcoder.pygmalion.top','https://acmcoder-unified-preview.pages.dev'];
export function validateHandoff(records){
  if(!Array.isArray(records)||!records.length||records.length>2000||recordBytes(records)>8*1024*1024)throw new Error('接续数据过大，请使用完整备份导入。');
  const validated=records.map(validateRecord),parents=validated.filter(r=>r.kind==='problem');
  if(parents.length!==1||validated.some(r=>r.kind!=='problem'&&r.problemId!==parents[0].id))throw new Error('接续只允许包含选中题目及其练习记录。');
  return validated;
}
export function createHandoffVault({storage,clock=()=>Date.now()}){
  let queue=Promise.resolve();
  const serial=work=>{const task=queue.then(work);queue=task.catch(()=>{});return task;};
  return {
    create:({records,source,targetOrigin,targetTabId})=>serial(async()=>{
      const validated=validateHandoff(records);
      if(storage.getKeys){const keys=(await storage.getKeys()).filter(k=>k.startsWith('handoff:'));const entries=await storage.get(keys);for(const [key,entry]of Object.entries(entries))if(entry.expiresAt<=clock())await storage.remove(key);}
      const nonce=Array.from(crypto.getRandomValues(new Uint8Array(16)),n=>n.toString(16).padStart(2,'0')).join('');
      const entry={records:validated,source,targetOrigin,targetTabId,expiresAt:clock()+5*60*1000};
      await storage.set({[`handoff:${nonce}`]:entry});return {nonce,expiresAt:entry.expiresAt};
    }),
    consume:({nonce,targetOrigin,targetTabId})=>serial(async()=>{
      if(!NONCE.test(nonce||''))throw new Error('接续标识无效。');
      const name=`handoff:${nonce}`,entry=(await storage.get([name]))[name];
      if(!entry)throw new Error('接续已使用或失效，请从原设备重新发起。');
      if(entry.expiresAt<=clock()){await storage.remove(name);throw new Error('接续已过期，请重新发起。');}
      if(entry.targetOrigin!==targetOrigin||entry.targetTabId!==targetTabId)throw new Error('接续目标不匹配。');
      await storage.remove(name);return {records:entry.records,source:entry.source};
    })
  };
}
export async function prepareHandoffImport({store,records}){
  const incoming=validateHandoff(records),existing=(await store.exportBackup()).records;
  const parent=incoming.find(r=>r.kind==='problem');
  const conflicts=incoming.filter(r=>existing.some(e=>e.kind===r.kind&&e.id===r.id&&JSON.stringify(e.payload)!==JSON.stringify(r.payload)));
  const deleted=await store.getMeta(`deleted:${parent.id}`);
  if(!conflicts.length&&!deleted)return {records:incoming,copy:false,problemId:parent.id,conflicts:0};
  const problemId=crypto.randomUUID(),ids=new Map(incoming.filter(r=>r.kind!=='problem'&&r.kind!=='draft').map(r=>[r.id,crypto.randomUUID()]));
  const mapped=incoming.map(r=>{
    const next=structuredClone(r);next.revision=0;
    if(r.kind==='problem'){next.id=problemId;next.payload.title=`${r.payload.title.slice(0,150)} · 接续副本`;}
    else{next.problemId=problemId;next.id=r.kind==='draft'?`${problemId}--${r.language}`:ids.get(r.id);if(next.payload.previousAttemptId)next.payload.previousAttemptId=ids.get(next.payload.previousAttemptId);}
    return next;
  });
  return {records:mapped,copy:true,problemId,conflicts:conflicts.length};
}
