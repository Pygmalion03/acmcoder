import {createBrowserRunner} from '../runner.js';
import {createJavaResourceLoader} from './java-loader.js';
export function createJavaRunner({resourceRoot='/vendor/java/',host=globalThis.window,loadResources=createJavaResourceLoader({root:resourceRoot}),createFrame=()=>{const frame=document.createElement('iframe');frame.hidden=true;frame.title='隔离 Java 8 运行器';frame.setAttribute('sandbox','allow-scripts');document.body.append(frame);return frame;}}={}){
  let active,delegate,frame;
  function cancel(id){if(active?.id!==id)return;const task=active;active=null;task.controller.abort();delegate?.cancel(id);const result={kind:'error',cancelled:true,text:'已停止运行。'};task.onEvent({...result,type:'error',id});task.resolve(result);}
  return {
    run(input,onEvent){
      if(input.language!=='java')return Promise.reject(new Error('Java 运行器语言不匹配。'));
      if(typeof input.code!=='string'||input.code.length>200000||typeof input.stdin!=='string'||input.stdin.length>200000)return Promise.reject(new Error('Java 代码或输入超过 200,000 字符。'));
      if(active)cancel(active.id);const controller=new AbortController();
      return new Promise(resolve=>{
        const task={id:input.id,onEvent,resolve,controller};active=task;
        const abort=()=>cancel(input.id);input.signal?.addEventListener('abort',abort,{once:true});
        const timer=setTimeout(()=>controller.abort(new Error('Java 资源准备超时，请检查网络后重试。')),120000);
        (async()=>{try{
          if(input.signal?.aborted){cancel(input.id);return;}
          onEvent({kind:'loading',type:'loading',id:input.id,text:'首次准备 Java 8 约需下载 40 MB；可随时停止…'});
          const {resources,bridgeUrl}=await loadResources({signal:controller.signal,onProgress:event=>{if(active===task)onEvent({...event,kind:'loading',type:'loading',id:input.id});}});
          if(active!==task)return;clearTimeout(timer);delegate?.destroy();frame?.remove();
          // A new opaque frame gives a fresh nonce handshake with a fixed,
          // content-addressed HTTP-cacheable bootstrap URL.
          frame=createFrame();delegate=createBrowserRunner({frame,bridgeUrl,staticBridge:true,host,initData:{resources},initTransfer:resources.map(resource=>resource.bytes),language:'java',codeLimit:200000,stdinLimit:200000,loadingMessage:'Java 编译或启动超过 30 秒，已停止。'});
          const result=await delegate.run({...input,signal:controller.signal},event=>{if(active===task)onEvent(event);});if(active===task){active=null;resolve(result);}
        }catch(error){if(active!==task)return;active=null;const result={kind:'error',text:error.message||String(error)};onEvent({...result,type:'error',id:input.id});resolve(result);}
        finally{clearTimeout(timer);input.signal?.removeEventListener('abort',abort);}})();
      });
    },cancel,destroy(){if(active)cancel(active.id);delegate?.destroy();frame?.remove();}
  };
}
