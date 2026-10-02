import {createBrowserRunner} from '../runner.js';
import {createCppResourceLoader} from './cpp-loader.js';
export function createCppRunner({frame,bridgeUrl='/shared/runners/cpp-bridge.html',resourceRoot='/vendor/cpp/',host=globalThis.window,loadResources=createCppResourceLoader({root:resourceRoot}),loadBridgeDocument}={}){
  let active=null,delegate=null;
  function cancel(id){if(active?.id!==id)return;const task=active;active=null;task.controller.abort();delegate?.cancel(id);task.onEvent({type:'error',kind:'error',id,cancelled:true,text:'已停止运行。'});task.resolve({kind:'error',cancelled:true,text:'已停止运行。'});}
  return {
    run(input,onEvent){if(input.language!=='cpp')return Promise.reject(new Error('C++ 运行器语言不匹配。'));if(typeof input.code!=='string'||input.code.length>200000||typeof input.stdin!=='string'||input.stdin.length>200000)return Promise.reject(new Error('C++ 代码或输入超过 200,000 字符。'));
      if(active)cancel(active.id);const controller=new AbortController();
      return new Promise(resolve=>{
        const task={id:input.id,controller,onEvent,resolve};active=task;const abort=()=>cancel(input.id);input.signal?.addEventListener('abort',abort,{once:true});
        const timer=setTimeout(()=>controller.abort(new Error('C++ 资源准备超时，请检查网络后重试。')),120000);
        const done=result=>{clearTimeout(timer);input.signal?.removeEventListener('abort',abort);if(active===task){active=null;resolve(result);}};
        (async()=>{try{
          if(input.signal?.aborted){cancel(input.id);return;}
          onEvent({type:'loading',kind:'loading',id:input.id,text:'首次准备 C++17 约需下载 28 MB；可随时停止…'});
          const resources=await loadResources({signal:controller.signal,onProgress:event=>{if(active===task)onEvent({type:'loading',kind:'loading',id:input.id,...event});}});
          const bridgeDocument=loadBridgeDocument?await loadBridgeDocument({signal:controller.signal}):undefined;
          if(active!==task)return;clearTimeout(timer);delegate?.destroy();
          delegate=createBrowserRunner({frame,bridgeUrl,bridgeDocument,host,initData:{resources},language:'cpp',codeLimit:200000,stdinLimit:200000,loadingMessage:'C++ 编译超过 30 秒，已停止。'});
          const result=await delegate.run({...input,signal:controller.signal},event=>{if(active===task)onEvent(event);});done(result);
        }catch(error){if(active!==task)return;const result={kind:'error',text:String(error.message||error)};onEvent({...result,type:'error',id:input.id});done(result);}})().finally(()=>{clearTimeout(timer);input.signal?.removeEventListener('abort',abort);});
      });
    },cancel,destroy(){if(active)cancel(active.id);delegate?.destroy();}
  };
}
