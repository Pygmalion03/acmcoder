const names=['clang22','lld22','memfs','sysroot22-standard.tar','worker.js'];
const digest=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),n=>n.toString(16).padStart(2,'0')).join('');
export function createCppResourceLoader({root='/vendor/cpp/',fetcher=globalThis.fetch,cache=globalThis.caches}={}){
  // Cache only public, hash-verified, compressed runtime files. No code, input,
  // user identity or credentials are ever placed in this runtime cache.
  return async function load({signal,onProgress=()=>{}}={}){
    const response=await fetcher(root+'manifest.json',{signal,credentials:'omit'});if(!response.ok)throw new Error('C++ 运行资源未完整部署。');
    const manifest=await response.json();
    if(manifest.version!=='clang22-wasi33-acmcoder.1'||manifest.encoding!=='gzip'||manifest.files?.length!==5||manifest.files.some((f,i)=>f.name!==names[i]||f.file!==f.name+'.gz'||!Number.isSafeInteger(f.bytes)||f.bytes<1||f.bytes>40000000||!Number.isSafeInteger(f.compressedBytes)||f.compressedBytes<1||f.compressedBytes>16000000||!(/^[a-f0-9]{64}$/).test(f.sha256)||!(/^[a-f0-9]{64}$/).test(f.compressedSha256)))throw new Error('C++ 资源版本不匹配。');
    if(!Number.isSafeInteger(manifest.totalBytes)||manifest.totalBytes!==manifest.files.reduce((sum,file)=>sum+file.compressedBytes,0))throw new Error('C++ 资源清单大小不匹配。');
    let saved;try{saved=await cache?.open('acmcoder-cpp-runtime-v1');}catch{}
    let loaded=0;
    const resources=await Promise.all(manifest.files.map(async file=>{
      const url=new URL(root+file.file,globalThis.location?.href||'https://runtime.invalid/').href;
      let compressed,cached;try{cached=await saved?.match(url);}catch{}
      if(cached){compressed=await cached.arrayBuffer();if(compressed.byteLength!==file.compressedBytes||await digest(compressed)!==file.compressedSha256){compressed=null;try{await saved.delete(url);}catch{}}}
      if(!compressed){const response=await fetcher(url,{signal,credentials:'omit'});if(!response.ok)throw new Error('C++ 下载未完成，请重试。');compressed=await response.arrayBuffer();if(compressed.byteLength!==file.compressedBytes||await digest(compressed)!==file.compressedSha256)throw new Error('C++ 资源校验失败，请重试。');try{await saved?.put(url,new Response(compressed));}catch{}}
      signal?.throwIfAborted();loaded+=file.compressedBytes;onProgress({text:`正在准备 C++17… ${Math.round(100*loaded/manifest.totalBytes)}%`});
      if(typeof DecompressionStream!=='function')throw new Error('请使用支持 gzip 解压的新版桌面浏览器。');
      const bytes=await new Response(new Blob([compressed]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
      signal?.throwIfAborted();if(bytes.byteLength!==file.bytes||await digest(bytes)!==file.sha256)throw new Error('C++ 解压资源校验失败。');return {name:file.name,bytes};
    }));return resources;
  };
}
