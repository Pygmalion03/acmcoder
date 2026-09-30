import {createBrowserStore} from '../shared/browser-store.js';
import {capturedProblem,leetcodeProblemId} from './capture.js';
export function createExtensionStore(options={}){return createBrowserStore({namespace:'extension-guest',...options});}
export async function migrateExtensionDrafts({store,storage=chrome.storage.local}){
  if(await store.getMeta('legacy-extension-migrated'))return;
  // Read only old learning keys, never the old API key or credentials.
  if(!storage.getKeys)return {unavailable:true};
  const keys=(await storage.getKeys()).filter(key=>/^acmcoder\.sidebar\.workspace\.[a-z0-9-]+\.(python|cpp|java)$/.test(key)||key==='acmcoder.lastPage');
  const data=await storage.get(keys);const records=[];let previous;
  try{if(data['acmcoder.lastPage'])previous=capturedProblem(data['acmcoder.lastPage']);}catch{/* original old record remains untouched */}
  if(previous)records.push(previous);
  for(const [key,draft] of Object.entries(data)){
    const match=/^acmcoder\.sidebar\.workspace\.([a-z0-9-]+)\.(python|cpp|java)$/.exec(key);if(!match||typeof draft?.code!=='string')continue;
    const problemId=leetcodeProblemId(match[1]),language=match[2];
    if(!records.some(r=>r.kind==='problem'&&r.id===problemId))records.push({kind:'problem',id:problemId,payload:{title:`旧插件草稿 · ${match[1]}`,sourceKind:'legacy',statement:'旧插件草稿已保留。可从原题链接重新导入题面。',sourceUrl:match[1]==='scratch'?'':`https://leetcode.cn/problems/${match[1]}/`}});
    records.push({kind:'draft',id:`${problemId}--${language}`,problemId,language,payload:{code:draft.code,stdin:draft.stdin||'',expected:draft.expected||'',mode:'normal',previousAttemptId:null}});
  }
  const result=await store.restoreBackup({version:3,records});
  if(result.conflicts.length)await store.setMeta('legacy-extension-conflicts',result.conflicts);
  await store.setMeta('legacy-extension-migrated',true);
  return result;
}
