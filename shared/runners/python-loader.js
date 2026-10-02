const names=['pyodide.js','pyodide.asm.js','pyodide.asm.wasm','python_stdlib.zip','pyodide-lock.json'];
export async function loadPythonResources({root='/vendor/python/',signal}={}){
  const response=await fetch(root+'manifest.json',{credentials:'omit',signal});
  if(!response.ok)throw new Error('Python 运行资源未完整部署。');
  const manifest=await response.json();
  if(manifest.version!=='0.29.3'||manifest.files?.length!==5||manifest.files.some((file,i)=>file.name!==names[i]||!Number.isSafeInteger(file.bytes)||file.bytes<1||file.bytes>25000000||!/^[a-f0-9]{64}$/.test(file.sha256)))throw new Error('Python 资源版本不匹配。');
  return Promise.all(manifest.files.map(async file=>{
    const response=await fetch(root+file.name,{credentials:'omit',signal});if(!response.ok)throw new Error('Python 资源下载未完成。');
    const bytes=await response.arrayBuffer();
    const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),n=>n.toString(16).padStart(2,'0')).join('');
    if(bytes.byteLength!==file.bytes||digest!==file.sha256)throw new Error('Python 资源校验失败。');
    return {name:file.name,bytes};
  }));
}
