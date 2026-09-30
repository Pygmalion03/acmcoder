import {validateRecord} from './records.js';
export function withoutCredentials(value){
  if(Array.isArray(value))return value.map(withoutCredentials);
  if(!value||typeof value!=='object')return value;
  return Object.fromEntries(Object.entries(value).filter(([key])=>!/^(api[_-]?key|access[_-]?token|refresh[_-]?token|authorization|password|secret|cookie)$/i.test(key)).map(([key,item])=>[key,withoutCredentials(item)]));
}
export function normalizeBackup(input){
  if(input?.version===3&&Array.isArray(input.records))return {...input,records:input.records.map(validateRecord)};
  if(![1,2].includes(input?.schemaVersion))throw new Error('不支持的备份版本。');
  for(const key of ['problems','drafts','submissions','progress','plans'])if(!Array.isArray(input[key]))throw new Error(`备份缺少 ${key}。`);
  const records=[];
  const push=(kind,id,payload,extra={})=>records.push(validateRecord({kind,id,payload,...extra}));
  for(const row of input.problems)push('problem',row.id,{...row,sourceUrl:row.sourceUrl??row.source_url??'',sourceKind:row.sourceKind??row.source_kind??'manual'});
  const parents=new Set(records.map(r=>r.id));
  const parent=id=>{
    if(!parents.has(id)){push('problem',id,{title:id==='sum'?'两个整数相加':id==='free'?'自由练习':'旧题目（历史恢复）',statement:'',sourceKind:'legacy',archivedAt:['sum','free'].includes(id)?null:1});parents.add(id);}
    return id;
  };
  for(const row of input.drafts){const problemId=parent(row.problemId??row.problem_id);push('draft',`${problemId}--python`,{code:row.code,stdin:row.stdin,expected:row.expected,mode:'normal',previousAttemptId:null},{problemId,language:'python'});}
  for(const row of input.submissions){const problemId=parent(row.problemId??row.problem_id);push('run',row.id,{status:row.status,code:row.code,stdout:row.stdout,stderr:row.stderr,createdAt:(row.createdAt??row.created_at)*1000},{problemId,language:'python'});}
  for(const row of input.progress){const problemId=parent(row.problemId??row.problem_id);push('progress',`progress-${problemId}`,{attempts:row.attempts,successes:row.successes,lastStatus:row.lastStatus??row.last_status,lastPracticedAt:row.lastPracticedAt??row.last_practiced_at},{problemId});}
  const days=new Map();
  for(const row of input.plans){const problemId=parent(row.problemId??row.problem_id);if(!/^\d{4}-\d{2}-\d{2}$/.test(row.day))throw new Error('备份计划日期无效。');const completed=days.get(row.day)||{};completed[problemId]=!!row.completed;days.set(row.day,completed);}
  for(const [day,completed]of days)push('plan',`plan-${day}`,{day,timezone:'Asia/Shanghai',completed});
  const settings=input.schemaVersion===1?input.settings:input.settings?.[0]?.settings??input.settings?.[0];
  if(settings)push('settings','preferences',withoutCredentials(settings));
  return {version:3,exportedAt:input.exportedAt||new Date().toISOString(),records};
}
