import {createBrowserRunner} from '../runner.js';
import {loadPythonResources} from './python-loader.js';
export function createPythonRunner({frame,loadResources=loadPythonResources}={}){
  let task,delegate;
  function cancel(id){if(task?.id!==id)return;const current=task;task=null;current.controller.abort();delegate?.cancel(id);const result={kind:'error',cancelled:true,text:'已停止运行。'};current.onEvent({...result,type:'error',id});current.resolve(result);}
  return {
    run(input,onEvent){
      if(task)cancel(task.id);
      const controller=new AbortController();
      return new Promise(resolve=>{
        const current={id:input.id,onEvent,resolve,controller};task=current;
        const abort=()=>cancel(input.id);input.signal?.addEventListener('abort',abort,{once:true});
        const timer=setTimeout(()=>controller.abort(new Error('Python 资源准备超时，请检查网络后重试。')),120000);
        (async()=>{
          try{
            if(input.signal?.aborted){cancel(input.id);return;}
            onEvent({kind:'loading',type:'loading',id:input.id,text:'正在准备 Python 运行资源…'});
            const resources=await loadResources({signal:controller.signal});if(task!==current)return;
            const response=await fetch('/runner/bridge.html',{credentials:'omit',signal:controller.signal});if(!response.ok)throw new Error('Python 启动资源未完整部署。');
            const bridgeDocument=await response.text();if(task!==current)return;
            clearTimeout(timer);delegate?.destroy();delegate=createBrowserRunner({frame,bridgeDocument,initData:{resources}});
            const result=await delegate.run({...input,signal:controller.signal},event=>{if(task===current)onEvent(event);});
            if(task===current){task=null;resolve(result);}
          }catch(error){if(task===current){task=null;const result={kind:'error',text:error.message};onEvent({...result,type:'error',id:input.id});resolve(result);}}
          finally{clearTimeout(timer);input.signal?.removeEventListener('abort',abort);}
        })();
      });
    },cancel,destroy(){if(task)cancel(task.id);delegate?.destroy();}
  };
}
