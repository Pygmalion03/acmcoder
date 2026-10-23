import test from 'node:test';
import assert from 'node:assert/strict';
import {mountWorkspaceLayout} from '../shared/ui/workspace-layout.js';

function element(){
  const events=new Map(),attributes=new Map();let pointer;
  return {dataset:{},attributes,style:{setProperty(name,value){this[name]=value;}},
    setAttribute(name,value){attributes.set(name,value);},focus(){this.focused=true;},
    addEventListener(name,handler){events.set(name,handler);},removeEventListener(name){events.delete(name);},
    emit(name,event={}){events.get(name)?.({preventDefault(){},...event});},
    setPointerCapture(id){pointer=id;},hasPointerCapture:id=>pointer===id,releasePointerCapture(){pointer=undefined;}
  };
}
function fixture(){
  const shell=element(),workspace=element(),splitter=element(),widths=[],panels=[];
  const buttons=['problem','code','result'].map(panel=>{const button=element();button.dataset.panel=panel;button.closest=()=>button;return button;});
  shell.querySelectorAll=()=>buttons;shell.contains=button=>buttons.includes(button);
  workspace.getBoundingClientRect=()=>({left:100,width:1000});
  const layout=mountWorkspaceLayout({shell,workspace,splitter,onWidthChange:value=>widths.push(value),onPanelChange:value=>panels.push(value)});
  return {shell,workspace,splitter,widths,panels,buttons,layout};
}

test('desktop dragging updates a bounded width and persists only at the end',()=>{
  const f=fixture();
  f.splitter.emit('pointerdown',{button:0,pointerId:7});
  f.splitter.emit('pointermove',{pointerId:7,clientX:500});
  assert.equal(f.workspace.style['--statement-width'],'40%');assert.deepEqual(f.widths,[]);
  f.splitter.emit('pointermove',{pointerId:7,clientX:1200});
  assert.equal(f.workspace.style['--statement-width'],'58%');
  f.splitter.emit('pointerup',{pointerId:7});assert.deepEqual(f.widths,[58]);
  assert.equal(f.splitter.hasPointerCapture(7),false);
  f.layout.destroy();
});

test('splitter keyboard adjustments are accessible and cleanup removes interactions',()=>{
  const f=fixture();
  f.splitter.emit('keydown',{key:'ArrowLeft'});assert.deepEqual(f.widths,[30]);
  assert.equal(f.splitter.attributes.get('aria-valuenow'),'30');
  f.splitter.emit('keydown',{key:'Home'});assert.equal(f.workspace.style['--statement-width'],'22%');
  f.layout.destroy();f.splitter.emit('keydown',{key:'End'});
  assert.deepEqual(f.widths,[30,22]);
});

test('narrow-screen tabs keep one selected panel and support arrow-key navigation',()=>{
  const f=fixture();assert.equal(f.shell.dataset.panel,'code');
  f.shell.emit('click',{target:f.buttons[2]});assert.equal(f.shell.dataset.panel,'result');
  assert.equal(f.buttons[2].attributes.get('aria-selected'),'true');assert.equal(f.buttons[1].tabIndex,-1);
  f.shell.emit('keydown',{target:f.buttons[2],key:'ArrowRight'});
  assert.equal(f.shell.dataset.panel,'problem');assert.equal(f.buttons[0].focused,true);
  f.layout.setPanel('invalid');assert.equal(f.shell.dataset.panel,'problem');
  f.layout.destroy();f.shell.emit('click',{target:f.buttons[1]});assert.equal(f.shell.dataset.panel,'problem');
});
