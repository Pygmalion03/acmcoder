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

export async function buildInfo(root,target){
  const {version}=JSON.parse(await fs.readFile(path.join(root,'package.json'),'utf8'));
  extensionVersion(version);
  let commit=process.env.ACMCODER_BUILD_COMMIT||process.env.CF_PAGES_COMMIT_SHA||process.env.GITHUB_SHA;
  if(!commit){try{commit=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim();}catch{commit='unknown';}}
  if(commit!=='unknown'&&!/^[a-f0-9]{40}$/.test(commit))throw new Error('Build commit must be a full Git SHA');
  return {version,commit,protocolVersion:1,minProtocolVersion:1,target,channel:version.includes('-')?'candidate':'stable',languages:target==='local-web'?['python','cpp','java']:['python'],features:{acm:true,autosave:true,rewrite:true,history:true,archive:true,backup:true,sync:true,aiBYOK:true,problemImport:true},acceptance:'See docs/releases/unified-feature-matrix.md; capabilities are not acceptance evidence.'};
}
