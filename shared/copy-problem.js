import {validateRecord} from './records.js';

// Used by handoff, sync conflicts and backup recovery. Remap every reference
// together, including the IDs the chat UI uses to find its conversation.
export function copyProblemRecords(records,{problemId,titleSuffix=' · 恢复副本',newId=crypto.randomUUID()}={}){
  const group=records.filter(r=>r.kind==='problem'?r.id===problemId:r.problemId===problemId);
  if(!group.some(r=>r.kind==='problem'))throw new Error('原题面无法恢复，请先导出双方内容。');
  const ids=new Map(group.map(r=>[`${r.kind}:${r.id}`,r.kind==='problem'?newId:
    r.kind==='draft'||r.kind==='conversation'&&r.language&&r.id===`${problemId}--${r.language}`?`${newId}--${r.language}`:crypto.randomUUID()]));
  // Draft and conversation can share an ID, but only attempts are referenced.
  const attempts=new Map(group.filter(r=>r.kind==='attempt').map(r=>[r.id,ids.get(`attempt:${r.id}`)]));
  const copied=group.map(r=>{
    const next=structuredClone(r);next.id=ids.get(`${r.kind}:${r.id}`);next.revision=0;next.updatedAt=Date.now();
    if(r.kind==='problem'){next.payload.title=r.payload.title.slice(0,160-titleSuffix.length)+titleSuffix;next.payload.archivedAt=null;}
    else{next.problemId=newId;if(next.payload.previousAttemptId){const mapped=attempts.get(next.payload.previousAttemptId);if(!mapped)throw new Error('备份缺失匹配的重写快照。');next.payload.previousAttemptId=mapped;}}
    return validateRecord(next);
  });
  return {problemId:newId,records:copied};
}
