const digest=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),n=>n.toString(16).padStart(2,'0')).join('');
export function createJavaResourceLoader({root='/vendor/java/',fetcher=globalThis.fetch}={}){
  return async({signal,onProgress=()=>{}}={})=>{
    const response=await fetcher(root+'manifest.json',{credentials:'omit',signal});if(!response.ok)throw new Error('Java 运行资源未完整部署。');
    const manifest=await response.json();
    if(manifest.version!=='doppio0.5-jcl3.2-acmcoder.1'||manifest.encoding!=='gzip'||!Array.isArray(manifest.files)||manifest.files.length<2||manifest.files.length>80||!/^bridge-[a-f0-9]{24}\.html$/.test(manifest.bridge))throw new Error('Java 资源清单无效。');
    if(manifest.files.some((f,i)=>f.file!==`resource-${i}.gz`||(i===0?f.name!=='worker.js':!/^vendor\/java_home\/[A-Za-z0-9_./-]+$/.test(f.name)||f.name.split('/').includes('..'))||!Number.isSafeInteger(f.bytes)||f.bytes<1||f.bytes>70000000||!Number.isSafeInteger(f.compressedBytes)||f.compressedBytes<1||f.compressedBytes>25*1024*1024||!/^[a-f0-9]{64}$/.test(f.sha256)||!/^[a-f0-9]{64}$/.test(f.compressedSha256)))throw new Error('Java 资源版本不匹配。');
    if(manifest.totalBytes!==manifest.files.reduce((sum,file)=>sum+file.compressedBytes,0)||manifest.totalBytes>60000000)throw new Error('Java 资源总量无效。');
    let done=0;const resources=[];
    // Sequential decompression avoids copying every large archive at once.
    for(const file of manifest.files){
      const response=await fetcher(root+file.file,{credentials:'omit',signal});if(!response.ok)throw new Error('Java 下载未完成。');
      const compressed=await response.arrayBuffer();if(compressed.byteLength!==file.compressedBytes||await digest(compressed)!==file.compressedSha256)throw new Error('Java 下载资源校验失败。');
      const bytes=await new Response(new Blob([compressed]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
      signal?.throwIfAborted();if(bytes.byteLength!==file.bytes||await digest(bytes)!==file.sha256)throw new Error('Java 解压资源校验失败。');
      resources.push({name:file.name,bytes});done+=file.compressedBytes;onProgress({text:`正在准备 Java 8… ${Math.round(100*done/manifest.totalBytes)}%`});
    }
    return {resources,bridgeUrl:root+manifest.bridge};
  };
}
