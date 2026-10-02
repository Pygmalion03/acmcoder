// Build replaces these with the complete, hash-verified public asset graph.
const revision=__OFFLINE_REVISION__;
const assets=__OFFLINE_ASSETS__;
const cacheName='acmcoder-site-'+revision;
const paths=new Set(assets.map(asset=>asset.path));
const hex=bytes=>Array.from(new Uint8Array(bytes),n=>n.toString(16).padStart(2,'0')).join('');
self.addEventListener('install',event=>event.waitUntil((async()=>{
  const cache=await caches.open(cacheName);
  try{
    // Bounded concurrency avoids holding every compiler binary in memory together.
    let cursor=0;
    await Promise.all(Array.from({length:3},async()=>{
      while(cursor<assets.length){
        const asset=assets[cursor++];
        const response=await fetch(asset.path,{cache:'reload',credentials:'omit'});
        if(!response.ok)throw new Error('Offline asset unavailable');
        const bytes=await response.clone().arrayBuffer();
        if(bytes.byteLength!==asset.bytes||hex(await crypto.subtle.digest('SHA-256',bytes))!==asset.sha256)throw new Error('Offline asset changed during download');
        await cache.put(asset.path,response);
      }
    }));
  }catch(error){await caches.delete(cacheName);throw error;}
})()));
self.addEventListener('activate',event=>event.waitUntil((async()=>{
  // No skipWaiting: an open editor keeps its complete previous module graph.
  for(const name of await caches.keys())if(name.startsWith('acmcoder-site-')&&name!==cacheName)await caches.delete(name);
  await self.clients.claim();
})()));
self.addEventListener('fetch',event=>{
  const url=new URL(event.request.url);
  if(event.request.method!=='GET'||url.origin!==self.location.origin||url.pathname.startsWith('/api/'))return;
  let path=url.pathname;
  if(path==='/'||path==='/index.html'||path==='/workspace')path='/workspace.html';
  // The runner's per-execution nonce is a query/fragment, not a different asset.
  if(!paths.has(path))return;
  event.respondWith((async()=>{const cache=await caches.open(cacheName);return await cache.match(path)||fetch(event.request);})());
});
