import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const rendererVersion='2.6.2';
const rendererIntegrity='sha512-xBaJish5OeGmniDj9cW5PRa/PtmuVU3ziqrbr5xJj901ZDN4TosrVaNZpEiLZAxdfnhAe7uQ7QFWfjPe9d9K2Q==';
const sha256=data=>createHash('sha256').update(data).digest('hex');
async function renderer(){
  const lock=JSON.parse(await fs.readFile(path.join(root,'package-lock.json'),'utf8'));
  if(lock.packages['node_modules/@resvg/resvg-js']?.version!==rendererVersion||lock.packages['node_modules/@resvg/resvg-js']?.integrity!==rendererIntegrity)throw new Error('SVG renderer lock differs from the pinned tool');
  return (await import('@resvg/resvg-js')).Resvg;
}
export async function buildExtensionIcons(outDir){
  const Resvg=await renderer(),svg=await fs.readFile(path.join(root,'shared/ui/brand-mark.svg'),'utf8');
  await fs.mkdir(outDir,{recursive:true});
  for(const size of [16,32,48,128]){
    // Store's 128px square keeps 16px transparent padding. Toolbar sizes use
    // less padding so the code-bracket/star symbol remains legible at 16px.
    const source=size<=32?svg.replace('viewBox="0 0 128 128"','viewBox="8 8 112 112"'):svg;
    const result=new Resvg(source,{fitTo:{mode:'width',value:size},font:{loadSystemFonts:false}}).render();
    if(result.width!==size||result.height!==size)throw new Error('Unexpected icon dimensions');
    await fs.writeFile(path.join(outDir,`acmcoder-${size}.png`),result.asPng());
  }
}
export async function buildStoreArt(outDir){
  const Resvg=await renderer();await fs.mkdir(outDir,{recursive:true});
  await buildExtensionIcons(path.join(outDir,'icons'));
  const icon=await fs.readFile(path.join(root,'shared/ui/brand-mark.svg'),'utf8');
  const inner=icon.slice(icon.indexOf('>')+1,icon.lastIndexOf('</svg>')).replace(/<title[^>]*>.*?<\/title>/s,'');
  const template=await fs.readFile(path.join(root,'assets/store/promo-small.svg'),'utf8');
  const source=template.replace('<!-- BRAND_MARK -->',inner);
  const result=new Resvg(source,{font:{loadSystemFonts:false}}).render();
  if(result.width!==440||result.height!==280)throw new Error('Unexpected promo dimensions');
  const png=result.asPng();await fs.writeFile(path.join(outDir,'promo-small-440x280.png'),png);
  await fs.writeFile(path.join(outDir,'promo-small-composed.svg'),source);
  const icons=await Promise.all([16,32,48,128].map(async size=>{
    const file=`icons/acmcoder-${size}.png`,data=await fs.readFile(path.join(outDir,file));
    return {file,width:size,height:size,bytes:data.length,sha256:sha256(data)};
  }));
  await fs.writeFile(path.join(outDir,'asset-manifest.json'),JSON.stringify({kind:'brand-art-not-screenshots',renderer:{name:'@resvg/resvg-js',version:rendererVersion,integrity:rendererIntegrity},sources:[{file:'shared/ui/brand-mark.svg',sha256:sha256(icon)},{file:'assets/store/promo-small.svg',sha256:sha256(template)}],icons,promo:{file:'promo-small-440x280.png',width:440,height:280,bytes:png.length,sha256:sha256(png)},screenshots:{status:'not-captured',required:'Actual installed final extension; never a promo illustration or website screenshot.'}},null,2)+'\n');
}
if(process.argv[1]===fileURLToPath(import.meta.url)){await buildStoreArt(process.argv[2]||path.join(root,'dist/store-assets'));console.log('Built extension icons and 440x280 brand art; actual screenshots remain separate.');}
