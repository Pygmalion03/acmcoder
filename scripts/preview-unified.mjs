import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
const root=path.resolve('dist/site');
const server=http.createServer(async(req,res)=>{
  const headers=await fs.readFile(path.join(root,'_headers'),'utf8');
  const policies=headers.split('\n\n').map(block=>({route:block.split('\n')[0],csp:block.split('\n').find(line=>line.includes('Content-Security-Policy:'))?.split('Content-Security-Policy:')[1].trim()}));
  const pathname=new URL(req.url,'http://localhost').pathname;
  const probe=pathname.startsWith('/language-probe/'),base=probe?path.resolve('dist/local-web/language-probe'):root;
  const relative=probe?decodeURIComponent(pathname.slice('/language-probe'.length)):pathname==='/'?'/workspace.html':decodeURIComponent(pathname);
  const file=path.resolve(base,`.${relative}`);
  if(!file.startsWith(base+path.sep)){res.writeHead(403).end();return;}
  const csp=probe?"default-src 'none'; script-src 'self' 'unsafe-eval'; style-src 'unsafe-inline'; worker-src 'self'; connect-src 'self'; object-src 'none'":policies.find(p=>p.route!=='/'&&(p.route.endsWith('*')?pathname.startsWith(p.route.slice(0,-1)):pathname===p.route))?.csp||policies.find(p=>p.route==='/')?.csp;
  try{
    const bytes=await fs.readFile(file);
    res.writeHead(200,{'content-type':{'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json'}[path.extname(file)]||'application/octet-stream','content-security-policy':csp,'cache-control':/^\/vendor\/java\/bridge-[a-f0-9]+\.html$/.test(pathname)?'public, max-age=31536000, immutable':'no-store','x-content-type-options':'nosniff'});res.end(bytes);
  }catch{res.writeHead(404,{'content-type':'application/json'}).end(JSON.stringify({error:'本地预览不提供云端接口；可粘贴题面导入。'}));}
});
server.listen(43118,'127.0.0.1',()=>console.log('Unified preview http://127.0.0.1:43118'));
