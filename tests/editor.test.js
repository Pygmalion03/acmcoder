import test from 'node:test';
import assert from 'node:assert/strict';
import {ensureSyntaxTree} from '@codemirror/language';
import {redo,undo} from '@codemirror/commands';
import {createCodeState} from '../shared/ui/editor-codemirror.js';
import {createTextareaBridge,mountCodeEditor} from '../shared/ui/editor.js';

for(const [language,code] of [
  ['python','name = "中文"\nprint(name)\n'],
  ['cpp','#include <iostream>\nint main() { std::cout << 42; }\n'],
  ['java','class Main { public static void main(String[] args) { System.out.println(42); } }']
])test(`editor includes an actual ${language} parser and undo history`,()=>{
  let state=createCodeState(code,{language});
  const tree=ensureSyntaxTree(state,code.length,1000);
  assert.equal(tree.length,code.length);
  const errors=[];tree.iterate({enter:node=>{if(node.type.isError)errors.push(node.from);}});
  assert.deepEqual(errors,[]);
  const dispatch=transaction=>{state=transaction.state;};
  state=state.update({changes:{from:0,to:state.doc.length,insert:'changed'}}).state;
  assert.ok(undo({state,dispatch}));assert.equal(state.doc.toString(),code);
  assert.ok(redo({state,dispatch}));assert.equal(state.doc.toString(),'changed');
});

test('IME updates the textarea bridge without saving intermediate composition or replacing editor state',()=>{
  const textarea={value:''},saved=[];
  const bridge=createTextareaBridge(textarea,()=>saved.push(textarea.value));
  bridge.sync('zh',{composing:true});bridge.sync('中',{composing:true});
  assert.equal(textarea.value,'中');assert.deepEqual(saved,[]);
  bridge.sync('中文');assert.deepEqual(saved,['中文']);
  bridge.sync('中文');assert.deepEqual(saved,['中文']);
  bridge.sync('中文输入',{composing:true});bridge.flush();
  assert.deepEqual(saved,['中文','中文输入']);
});

test('explicit save capture does not recurse through onChange and destroyed bridges ignore late changes',()=>{
  const textarea={value:'original'};let saves=0;
  const bridge=createTextareaBridge(textarea,()=>saves++);
  bridge.sync('正在输入',{composing:true});bridge.capture('输入完成');bridge.flush();
  assert.equal(textarea.value,'输入完成');assert.equal(saves,0);
  bridge.destroy();bridge.sync('late');bridge.flush();
  assert.equal(textarea.value,'输入完成');assert.equal(saves,0);
});

test('an unbuilt source checkout clearly keeps its editable textarea and shortcut until destroyed',async()=>{
  const textarea=new EventTarget();textarea.value='print(1)';textarea.hidden=false;textarea.isConnected=true;textarea.focus=()=>{};
  const statuses=[];let runs=0;
  const editor=mountCodeEditor({textarea,language:'python',onRun:()=>runs++,onStatus:message=>statuses.push(message)});
  const result=await editor.ready;
  assert.equal(result.mode,'basic');assert.equal(textarea.hidden,false);
  assert.match(statuses.at(-1),/基础文本编辑器/);
  const shortcut=new Event('keydown',{cancelable:true});Object.assign(shortcut,{key:'Enter',ctrlKey:true});
  textarea.dispatchEvent(shortcut);assert.equal(runs,1);assert.equal(shortcut.defaultPrevented,true);
  const composing=new Event('keydown',{cancelable:true});Object.assign(composing,{key:'Enter',ctrlKey:true,isComposing:true});
  textarea.dispatchEvent(composing);assert.equal(runs,1);
  editor.destroy();
  const later=new Event('keydown');Object.assign(later,{key:'Enter',ctrlKey:true});textarea.dispatchEvent(later);assert.equal(runs,1);
});
