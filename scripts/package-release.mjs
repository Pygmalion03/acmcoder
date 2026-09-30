import fs from 'node:fs/promises';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const {version}=JSON.parse(await fs.readFile(path.join(root,'package.json'),'utf8'));
const candidate=process.argv.includes('--candidate');
execFileSync(process.execPath,[path.join(root,'scripts/check-release.mjs'),...(candidate?['--candidate']:[])],{cwd:root,stdio:'inherit'});
const metadata=JSON.parse(await fs.readFile(path.join(root,'dist/extension/version.json'),'utf8'));
const output=path.join(root,'dist/releases',version);await fs.mkdir(output,{recursive:true});
const sourceName=`acmcoder-source-v${version}.tar.gz`,sourceFile=path.join(output,sourceName);
if(process.env.ACMCODER_SOURCE_ARCHIVE){
  const data=await fs.readFile(process.env.ACMCODER_SOURCE_ARCHIVE);
  const header=gunzipSync(data).subarray(0,4096).toString('utf8');
  if(!header.includes(`comment=${metadata.commit}\n`))throw new Error('Source archive commit differs from client builds');
  await fs.writeFile(sourceFile,data);
}else execFileSync('git',['archive','--format=tar.gz',`--prefix=acmcoder-v${version}/`,'-o',sourceFile,metadata.commit],{cwd:root});
const extensionName=`acmcoder-extension-v${version}.zip`,extensionFile=path.join(output,extensionName);
execFileSync('python3',['-c',`import pathlib,sys,zipfile
root=pathlib.Path(sys.argv[1])
with zipfile.ZipFile(sys.argv[2],"w",compression=zipfile.ZIP_DEFLATED,compresslevel=9) as archive:
 for item in sorted(root.rglob("*")):
  if item.is_file():
   info=zipfile.ZipInfo(item.relative_to(root).as_posix(),(1980,1,1,0,0,0))
   info.compress_type=zipfile.ZIP_DEFLATED
   info.external_attr=0o100644<<16
   archive.writestr(info,item.read_bytes())
`,path.join(root,'dist/extension'),extensionFile]);
const artifacts=[];
for(const name of [sourceName,extensionName]){const data=await fs.readFile(path.join(output,name));artifacts.push({name,bytes:data.length,sha256:createHash('sha256').update(data).digest('hex')});}
const manifest={version,commit:metadata.commit,protocolVersion:metadata.protocolVersion,channel:metadata.channel,artifacts,website:{deploymentId:null,status:'not-associated'},images:{app:null,runner:null,status:'not-published'},acceptance:JSON.parse(await fs.readFile(path.join(root,'docs/releases/unified-acceptance.json'),'utf8'))};
await fs.writeFile(path.join(output,'release-manifest.json'),JSON.stringify(manifest,null,2)+'\n');
await fs.writeFile(path.join(output,'SHA256SUMS'),artifacts.map(a=>`${a.sha256}  ${a.name}`).join('\n')+'\n');
console.log(`Prepared ${metadata.channel} artifacts in ${output}; deployment and image digests must be associated after acceptance.`);
