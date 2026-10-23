export function createTextareaBridge(textarea,onChange){
  let pending=false,active=true;
  function flush(){
    if(!active||!pending)return;
    pending=false;
    if(onChange)onChange();else textarea.dispatchEvent(new Event('input',{bubbles:true}));
  }
  return {
    sync(value,{composing=false}={}){if(!active)return;if(textarea.value!==value){textarea.value=value;pending=true;}if(!composing)flush();},
    capture(value){if(!active)return;textarea.value=value;pending=false;},
    flush,
    destroy(){active=false;pending=false;}
  };
}

let editorModule;
export function mountCodeEditor({textarea,language,onRun,onChange,onStatus=()=>{}}){
  const bridge=createTextareaBridge(textarea,onChange);
  let editor=null,destroyed=false,loaded=false;
  const notify=()=>{if(onChange)onChange();else textarea.dispatchEvent(new Event('input',{bubbles:true}));};
  function basicKeydown(event){
    if(event.isComposing||event.keyCode===229)return;
    if(event.key==='Enter'&&(event.ctrlKey||event.metaKey)){event.preventDefault();onRun?.();}
    else if(event.key==='Tab'&&!event.shiftKey){event.preventDefault();textarea.setRangeText('    ',textarea.selectionStart,textarea.selectionEnd,'end');notify();}
  }
  textarea.addEventListener('keydown',basicKeydown);
  onStatus('正在准备代码编辑器…');
  const ready=(editorModule??=import('./editor.bundle.js')).then(module=>{
    if(destroyed||!textarea.isConnected)return {mode:'cancelled'};
    loaded=true;
    editor=module.mountCodeMirror({textarea,language,bridge,onRun});
    textarea.hidden=true;
    textarea.removeEventListener('keydown',basicKeydown);
    onStatus('代码高亮与查找已就绪 · Ctrl/Cmd+Enter 运行');
    return {mode:'rich'};
  }).catch(()=>{
    if(!destroyed)onStatus(loaded?'基础文本编辑器 · 增强编辑器暂不可用':'基础文本编辑器 · 构建客户端后启用高亮与查找');
    return {mode:destroyed?'cancelled':'basic'};
  });
  return {
    ready,
    flush(){editor?.flush();},
    focus(){if(editor)editor.focus();else textarea.focus();},
    destroy(){if(destroyed)return;destroyed=true;editor?.flush();editor?.destroy();bridge.destroy();textarea.hidden=false;textarea.removeEventListener('keydown',basicKeydown);}
  };
}
