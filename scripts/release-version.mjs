import fs from 'node:fs/promises';
import path from 'node:path';
import {execFileSync} from 'node:child_process';

export function extensionVersion(version){
  const match=/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-rc\.([1-9]\d*))?$/.exec(version);
  if(!match)throw new Error('Unsupported product version; use major.minor.patch or -rc.N');
  const parts=match.slice(1,4).map(Number),build=match[4]?Number(match[4]):65535;
  if(parts.some(n=>n>65535)||build>65535||match[4]&&build===65535)throw new Error('Extension version exceeds its numeric range');
  return [...parts,build].join('.');
}

export function releaseLanguages(version,target){
  const parts=extensionVersion(version).split('.').map(Number);
  const cpp=parts[0]>4||(parts[0]===4&&(parts[1]>0||parts[2]>0||parts[3]>=4));
  const java=parts[0]>4||(parts[0]===4&&parts[1]>=1);
  return target==='local-web'||java?['python','cpp','java']:cpp?['python','cpp']:['python'];
}
export async function buildInfo(root,target){
  const {version}=JSON.parse(await fs.readFile(path.join(root,'package.json'),'utf8'));
  extensionVersion(version);
  let commit=process.env.ACMCODER_BUILD_COMMIT||process.env.CF_PAGES_COMMIT_SHA||process.env.GITHUB_SHA;
  if(!commit){try{commit=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim();}catch{commit='unknown';}}
  if(commit!=='unknown'&&!/^[a-f0-9]{40}$/.test(commit))throw new Error('Build commit must be a full Git SHA');
  let sourceState=process.env.ACMCODER_BUILD_SOURCE_STATE||'unverified';
  if(!['clean','modified','unverified'].includes(sourceState))throw new Error('Build source state must be clean, modified or unverified');
  try{
    const head=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim();
    const changes=execFileSync('git',['status','--porcelain','--untracked-files=normal'],{cwd:root,encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim();
    sourceState=changes?'modified':head===commit?'clean':'unverified';
  }catch{/* Source exports and Docker contexts must explicitly declare their provenance. */}
  return {version,commit,sourceState,protocolVersion:1,minProtocolVersion:1,target,channel:sourceState!=='clean'?'development':version.includes('-')?'candidate':'stable',languages:releaseLanguages(version,target),features:{acm:true,autosave:true,rewrite:true,history:true,archive:true,backup:true,sync:true,aiBYOK:true,problemImport:true,multiCase:true,codeEditor:true,dailyQueue:true,conversationTurns:true},acceptance:'See docs/releases/unified-feature-matrix.md; capabilities are not acceptance evidence.'};
}
