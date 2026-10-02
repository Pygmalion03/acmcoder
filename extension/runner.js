import {createBrowserRunner} from '../shared/runner.js';
import {createCppRunner} from '../shared/runners/cpp-runner.js';
import {createMultiRunner} from '../shared/runners/multi-runner.js';
import {createJavaRunner} from '../shared/runners/java-runner.js';
let runtime;
async function loadRuntime(){
  const root=chrome.runtime.getURL('vendor/python/');
  const response=await fetch(`${root}manifest.json`);if(!response.ok)throw new Error('插件缺失 Python 运行资源，请安装完整发行包。');
  const manifest=await response.json();
  if(manifest.version!=='0.29.3'||manifest.files.length!==5)throw new Error('Python 资源版本不匹配。');
  return Promise.all(manifest.files.map(async file=>{
    const response=await fetch(root+file.name);if(!response.ok)throw new Error('Python 资源未完整安装。');
    const bytes=await response.arrayBuffer();
    const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),n=>n.toString(16).padStart(2,'0')).join('');
    if(bytes.byteLength!==file.bytes||digest!==file.sha256)throw new Error('Python 资源校验失败，请重新安装完整发行包。');
    return {name:file.name,bytes};
  }));
}
export async function createExtensionRunner({frame,cppFrame}){
  runtime??=loadRuntime().catch(error=>{runtime=null;throw error;});
  const resources=await runtime;
  const python=createBrowserRunner({frame,bridgeUrl:chrome.runtime.getURL('runner/index.html'),initData:{resources},loadingMessage:'本地 Python 启动超时，请重新打开侧栏。'});
  if(!cppFrame)return python;
  return createMultiRunner({python,cpp:createCppRunner({frame:cppFrame,bridgeUrl:chrome.runtime.getURL('shared/runners/cpp-bridge.html'),resourceRoot:chrome.runtime.getURL('vendor/cpp/')}),java:createJavaRunner({resourceRoot:chrome.runtime.getURL('vendor/java/')})});
}
