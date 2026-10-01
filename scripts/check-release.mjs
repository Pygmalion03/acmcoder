import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {extensionVersion,releaseLanguages} from './release-version.mjs';

export const REQUIRED_ACCEPTANCE=['anonymous-site','offline-extension','browser-cpp-two-clients','local-docker','durable-history','cloud-backup-roundtrip','backup-edit-during-export','sync-conflict-delete','two-real-accounts','ai-real-three-clients','ai-original-import','old-install-upgrade'];
export function validateRelease({version,lockVersion,clients,manifest,tag,candidate=false,license=false,acceptance={}}){
  const failures=[];
  if(lockVersion!==version)failures.push('Lockfile version differs from package.json');
  if(tag&&tag!==`v${version}`)failures.push('Release tag differs from package.json');
  const expected=extensionVersion(version);
  if(manifest.version!==expected||manifest.version_name!==version)failures.push('Extension version differs from product version');
  const commits=new Set(clients.map(c=>c.commit));
  if(commits.size!==1||clients.some(c=>!/^[a-f0-9]{40}$/.test(c.commit||'')))failures.push('Clients do not have one known source commit');
  for(const target of ['site','extension','local-web']){
    const c=clients.find(c=>c.target===target);
    if(!c||c.version!==version||c.protocolVersion!==1||c.minProtocolVersion!==1)failures.push(`Missing or mismatched ${target} metadata`);
    const expectedLanguages=releaseLanguages(version,target);
    if(c&&JSON.stringify(c.languages)!==JSON.stringify(expectedLanguages))failures.push(`Unexpected ${target} language claim`);
  }
  if(candidate&&!/-rc\.[1-9]\d*$/.test(version))failures.push('Candidate checks require an explicitly named RC');
  if(!candidate){
    if(version.includes('-'))failures.push('A candidate is not a stable release');
    if(!license)failures.push('Repository license has not been chosen');
    for(const id of REQUIRED_ACCEPTANCE)if(acceptance[id]?.status!=='passed'||!acceptance[id]?.evidence)failures.push(`Acceptance pending: ${id}`);
  }
  return failures;
}

async function main(){
  const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),read=async name=>JSON.parse(await fs.readFile(path.join(root,name),'utf8'));
  const pkg=await read('package.json'),lock=await read('package-lock.json');
  const clients=await Promise.all(['site','extension','local-web'].map(target=>read(`dist/${target}/version.json`)));
  const manifest=await read('dist/extension/manifest.json');
  const acceptance=(await read('docs/releases/unified-acceptance.json')).checks;
  const failures=validateRelease({version:pkg.version,lockVersion:lock.version,clients,manifest,candidate:process.argv.includes('--candidate'),tag:process.env.ACMCODER_RELEASE_TAG,license:await fs.access(path.join(root,'LICENSE')).then(()=>true,()=>false),acceptance});
  if(lock.packages[''].version!==pkg.version)failures.push('Lockfile root package differs');
  for(const client of clients)if(process.env.ACMCODER_BUILD_COMMIT&&client.commit!==process.env.ACMCODER_BUILD_COMMIT)failures.push('Build does not match the requested source commit');
  for(const file of ['docs/upgrade.md','docs/data-and-privacy.md','THIRD_PARTY_NOTICES.md','docs/releases/unified-feature-matrix.md'])await fs.access(path.join(root,file));
  if(failures.length){console.error(failures.join('\n'));process.exitCode=1;return;}
  console.log(`${process.argv.includes('--candidate')?'Candidate artifact consistency':'Stable release gate'} passed: ${pkg.version} ${clients[0].commit}`);
}
if(process.argv[1]===fileURLToPath(import.meta.url))main().catch(error=>{console.error(error.message);process.exitCode=1;});
