import {withoutCredentials} from '/shared/backup.js';
export async function migrateLocalDrafts(store,storage=localStorage){
  if(storage.getItem('acmcoder-local-browser-migrated-v3'))return;
  const records=[],parents=new Set(),existing=await store.listRecords({kind:'problem'});
  for(let i=0;i<storage.length;i++){
    const key=storage.key(i),match=/^acmcoder\.web\.(?:practice\.v2|problem)\.([a-zA-Z0-9_-]+)\.(python|cpp|java)$/.exec(key||'');if(!match)continue;
    const source=JSON.parse(storage.getItem(key));if(typeof source?.code!=='string')continue;
    const slug=match[1],language=match[2];
    const known=existing.find(p=>p.payload.legacySlug===slug||p.payload.sourceUrl?.includes(`/problems/${slug}/`));
    const problemId=known?.id||`legacy-${slug}`.slice(0,80);
    if(!known&&!parents.has(problemId)){parents.add(problemId);records.push({kind:'problem',id:problemId,payload:{title:`旧版练习 · ${slug}`.slice(0,160),statement:'原草稿与历史已保留，可从原题补充题面。',sourceKind:'legacy',sourceUrl:`https://leetcode.cn/problems/${slug}/`}});}
    const previous=source.previousRound,previousId=previous&&typeof previous.code==='string'?crypto.randomUUID():null;
    if(previous&&typeof previous.code==='string')records.push({kind:'attempt',id:previousId,problemId,language,payload:{code:previous.code,stdin:previous.stdin||'',expected:previous.expected||'',reason:'imported',createdAt:1}});
    records.push({kind:'draft',id:`${problemId}--${language}`,problemId,language,payload:{code:source.code,stdin:source.stdin||'',expected:source.expected||'',mode:source.reinforcement?.status==='active'&&previousId?'rewrite':'normal',previousAttemptId:source.reinforcement?.status==='active'?previousId:null}});
    if(source.lastResult)records.push({kind:'run',id:crypto.randomUUID(),problemId,language,payload:{...withoutCredentials(source.lastResult),code:source.code,stdin:source.stdin||'',expected:source.expected||'',createdAt:1}});
    if(Array.isArray(source.ai?.current)&&source.ai.current.length)records.push({kind:'conversation',id:crypto.randomUUID(),problemId,language,payload:{messages:withoutCredentials(source.ai.current)}});
  }
  const result=await store.restoreBackup({version:3,records});if(result.conflicts.length)await store.setMeta('legacy-local-browser-conflicts',result.conflicts);
  storage.setItem('acmcoder-local-browser-migrated-v3','true');
}
