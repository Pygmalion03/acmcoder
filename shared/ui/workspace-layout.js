const panels=new Set(['problem','code','result']);
const clamp=width=>Math.min(58,Math.max(22,width));

export function mountWorkspaceLayout({shell,workspace,splitter,onWidthChange=()=>{},onPanelChange=()=>{},initialWidth=32,initialPanel='code'}){
  let width=clamp(Number(initialWidth)||32),drag=null;
  function showWidth(value){width=clamp(value);workspace.style.setProperty('--statement-width',`${width}%`);splitter.setAttribute('aria-valuenow',String(Math.round(width)));}
  function setPanel(panel){
    if(!panels.has(panel))return;
    shell.dataset.panel=panel;
    shell.querySelectorAll('.practice-tabs [data-panel]').forEach(button=>{const selected=button.dataset.panel===panel;button.setAttribute('aria-selected',String(selected));button.tabIndex=selected?0:-1;});
    onPanelChange(panel);
  }
  function pointerdown(event){
    if(event.button!==0)return;
    const rect=workspace.getBoundingClientRect();drag={id:event.pointerId,left:rect.left,width:rect.width};
    splitter.setPointerCapture(event.pointerId);event.preventDefault();
  }
  function pointermove(event){if(drag?.id===event.pointerId)showWidth((event.clientX-drag.left)/drag.width*100);}
  function finish(event){if(drag?.id!==event.pointerId)return;drag=null;if(splitter.hasPointerCapture(event.pointerId))splitter.releasePointerCapture(event.pointerId);onWidthChange(width);}
  function keydown(event){
    if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
    event.preventDefault();showWidth(event.key==='Home'?22:event.key==='End'?58:width+(event.key==='ArrowLeft'?-2:2));onWidthChange(width);
  }
  function panelClick(event){const button=event.target.closest('.practice-tabs [data-panel]');if(button&&shell.contains(button))setPanel(button.dataset.panel);}
  function panelKeydown(event){
    const button=event.target.closest('.practice-tabs [data-panel]');if(!button||!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
    const buttons=[...shell.querySelectorAll('.practice-tabs [data-panel]')],index=buttons.indexOf(button);
    const next=event.key==='Home'?0:event.key==='End'?buttons.length-1:(index+(event.key==='ArrowLeft'?-1:1)+buttons.length)%buttons.length;
    event.preventDefault();setPanel(buttons[next].dataset.panel);buttons[next].focus();
  }
  splitter.setAttribute('role','separator');splitter.setAttribute('aria-label','调整题面与代码宽度');splitter.setAttribute('aria-orientation','vertical');splitter.setAttribute('aria-valuemin','22');splitter.setAttribute('aria-valuemax','58');splitter.tabIndex=0;
  showWidth(width);setPanel(panels.has(initialPanel)?initialPanel:'code');
  splitter.addEventListener('pointerdown',pointerdown);splitter.addEventListener('pointermove',pointermove);splitter.addEventListener('pointerup',finish);splitter.addEventListener('pointercancel',finish);splitter.addEventListener('keydown',keydown);
  shell.addEventListener('click',panelClick);shell.addEventListener('keydown',panelKeydown);
  return {setPanel,destroy(){
    if(drag&&splitter.hasPointerCapture(drag.id))splitter.releasePointerCapture(drag.id);drag=null;
    splitter.removeEventListener('pointerdown',pointerdown);splitter.removeEventListener('pointermove',pointermove);splitter.removeEventListener('pointerup',finish);splitter.removeEventListener('pointercancel',finish);splitter.removeEventListener('keydown',keydown);
    shell.removeEventListener('click',panelClick);shell.removeEventListener('keydown',panelKeydown);
  }};
}
