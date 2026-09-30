import {withoutCredentials} from './backup.js';

export async function migrateBrowserDrafts({store,namespace,storage=globalThis.localStorage}){
  if(!storage||await store.getMeta('legacy-browser-migrated'))return {imported:0};
  const prefix=namespace==='guest'?'acmcoder-free-draft-v1:':`acmcoder-free-draft-v2:${namespace}:`;
  const records=[];
  for(let i=0;i<storage.length;i++){
    const key=storage.key(i);if(!key?.startsWith(prefix))continue;
    const problemId=key.slice(prefix.length);
    if(!/^[a-zA-Z0-9_-]{1,80}$/.test(problemId))continue;
    const values=JSON.parse(storage.getItem(key));
    if(!values||typeof values.code!=='string')continue;
    if(!await store.getRecord({kind:'problem',id:problemId}))records.push({kind:'problem',id:problemId,payload:{title:problemId==='sum'?'两个整数相加':problemId==='free'?'自由练习':`旧版草稿 · ${problemId}`,statement:'旧版本机草稿已保留，题面可从原题或云端补充。',sourceKind:'legacy'}});
    records.push({kind:'draft',id:`${problemId}--python`,problemId,language:'python',payload:{code:values.code,stdin:values.stdin||'',expected:values.expected||'',mode:'normal',previousAttemptId:null}});
    const previousRaw=storage.getItem(`acmcoder-prior-round:${namespace}:${problemId}`);
    if(previousRaw){const previous=JSON.parse(previousRaw);if(typeof previous?.code==='string')records.push({kind:'attempt',id:`legacy-before-${problemId}`,problemId,language:'python',payload:{code:previous.code,stdin:previous.stdin||'',expected:previous.expected||'',reason:'imported',createdAt:previous.savedAt||1}});}
    const conversationRaw=storage.getItem(`acmcoder-ai-v1:${namespace}:${problemId}`);
    if(conversationRaw){const conversation=JSON.parse(conversationRaw);if(Array.isArray(conversation)){const messages=conversation.flatMap(pair=>typeof pair.question==='string'&&typeof pair.answer==='string'?[{role:'user',content:pair.question},{role:'assistant',content:pair.answer}]:[]);if(messages.length)records.push({kind:'conversation',id:`legacy-ai-${problemId}`,problemId,language:'python',payload:{messages:withoutCredentials(messages)}});}}
  }
  const result=await store.restoreBackup({version:3,records});
  if(result.conflicts.length)await store.setMeta('legacy-browser-conflicts',result.conflicts);
  await store.setMeta('legacy-browser-migrated',true);
  return result;
}
