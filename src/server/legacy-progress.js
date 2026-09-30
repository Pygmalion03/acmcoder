import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {withoutCredentials} from '../../shared/backup.js';

const marker='legacy-progress-migrated-v1';
const normalizeSlug=value=>String(value||'').trim().replace(/^memory:/,'');
const slugFromProblem=problem=>normalizeSlug(problem.payload.legacySlug)||/^https:\/\/leetcode\.(?:cn|com)\/problems\/([a-z0-9-]+)\/?$/.exec(problem.payload.sourceUrl||'')?.[1];
async function read(file){
  if(!file)return null;
  try{return await fs.readFile(file,'utf8');}catch(error){if(error.code==='ENOENT')return null;throw error;}
}

export async function migrateLegacyProgress({store,progressFile,memoryFile,dataDir}){
  if(await store.getMeta(marker))return;
  const raw=await read(progressFile);
  if(raw===null){await store.setMeta(marker,{imported:0,skippedDeleted:0});return;}
  const body=JSON.parse(raw),entries=body?.items;
  if(!entries||typeof entries!=='object'||Array.isArray(entries))throw new Error('旧版练习统计格式无效，原文件已保留。');
  const problems=await store.listRecords({kind:'problem'}),bySlug=new Map();
  for(const problem of problems){const slug=slugFromProblem(problem);if(slug&&!bySlug.has(slug))bySlug.set(slug,problem);}
  // Older page migration did not save its ID map. Recover the same deterministic
  // IDs from its preserved input so deleting a migrated question stays final.
  const pagesRaw=await read(path.join(dataDir,'legacy-originals/pages.jsonl'))??await read(memoryFile);
  const pageIds=new Map();
  if(pagesRaw)for(const [index,page] of pagesRaw.split('\n').filter(Boolean).map(line=>JSON.parse(line)).filter(p=>p.slug&&p.content).entries()){
    if(!pageIds.has(normalizeSlug(page.slug)))pageIds.set(normalizeSlug(page.slug),`legacy-page-${index}`);
  }
  const parents=new Map(),progress=new Map();let skippedDeleted=0;
  for(const [key,item] of Object.entries(entries)){
    const slug=normalizeSlug(key);if(!/^[a-zA-Z0-9_-]+$/.test(slug)||!item||typeof item!=='object')throw new Error('旧版练习统计包含无效题目，原文件已保留。');
    let parent=bySlug.get(slug);
    const fallback=slug.length<=73?`legacy-${slug}`:`legacy-${slug.slice(0,60)}-${createHash('sha256').update(slug).digest('hex').slice(0,10)}`;
    const problemId=parent?.id||pageIds.get(slug)||fallback;
    if(await store.getMeta(`deleted:${problemId}`)){skippedDeleted++;continue;}
    if(!parent)parent=problems.find(p=>p.id===problemId)||{kind:'problem',id:problemId,payload:{title:`旧版练习 · ${slug}`.slice(0,160),statement:'旧版自测记录已保留，可从原题补充题面。',sourceKind:'legacy',sourceUrl:`https://leetcode.cn/problems/${slug}/`,legacySlug:slug}};
    parents.set(problemId,parent);
    const successes=Number.isFinite(Number(item.acCount))?Math.max(0,Number(item.acCount)):0;
    const lastPracticedAt=Date.parse(item.lastAcceptedAt)||null;
    const row={kind:'progress',id:`legacy-progress-${createHash('sha256').update(problemId).digest('hex')}`,problemId,payload:{successes,lastPracticedAt,lastStatus:'legacy_self_pass',legacyProgress:withoutCredentials(item)}};
    const previous=progress.get(problemId);
    if(!previous||successes>previous.payload.successes)progress.set(problemId,row);
    else if(successes===previous.payload.successes&&lastPracticedAt>previous.payload.lastPracticedAt)progress.set(problemId,row);
  }
  const backupDir=path.join(dataDir,'legacy-originals');await fs.mkdir(backupDir,{recursive:true});
  try{await fs.writeFile(path.join(backupDir,'progress.json'),JSON.stringify(withoutCredentials(body)),{flag:'wx',mode:0o600});}catch(error){if(error.code!=='EEXIST')throw error;}
  const result=await store.restoreBackup({version:3,records:[...parents.values(),...progress.values()]});
  // The restore transaction keeps conflicting values. A crash before this marker
  // merely retries deterministic records, without incrementing or replacing them.
  await store.setMeta(marker,{imported:result.imported,skippedDeleted,conflicts:result.conflicts.length});
}
