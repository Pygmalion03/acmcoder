import {EditorState,Prec} from '@codemirror/state';
import {EditorView,drawSelection,highlightActiveLine,highlightActiveLineGutter,keymap,lineNumbers} from '@codemirror/view';
import {defaultKeymap,history,historyKeymap,indentWithTab} from '@codemirror/commands';
import {HighlightStyle,indentOnInput,indentUnit,syntaxHighlighting} from '@codemirror/language';
import {searchKeymap} from '@codemirror/search';
import {python} from '@codemirror/lang-python';
import {cpp} from '@codemirror/lang-cpp';
import {java} from '@codemirror/lang-java';
import {tags} from '@lezer/highlight';

const languageSupport={python,cpp,java};
const highlighting=HighlightStyle.define([
  {tag:tags.keyword,color:'var(--editor-keyword,#8554bd)'},
  {tag:[tags.name,tags.propertyName],color:'var(--ink)'},
  {tag:[tags.string,tags.character],color:'var(--editor-string,#25725d)'},
  {tag:[tags.number,tags.bool,tags.null],color:'var(--editor-number,#a6572b)'},
  {tag:tags.comment,color:'var(--muted)',fontStyle:'italic'},
  {tag:tags.typeName,color:'var(--editor-type,#246d9a)'},
  {tag:tags.operator,color:'var(--primary)'}
]);
const theme=EditorView.theme({
  '&':{height:'100%',color:'var(--ink)',backgroundColor:'var(--code)',fontSize:'14px'},
  '&.cm-focused':{outline:'none'},
  '.cm-scroller':{fontFamily:'"SFMono-Regular",Consolas,monospace',lineHeight:'1.75',overflow:'auto'},
  '.cm-content':{padding:'12px 0',caretColor:'var(--ink)'},
  '.cm-line':{padding:'0 14px'},
  '.cm-gutters':{backgroundColor:'var(--code)',color:'var(--muted)',borderRight:'1px solid var(--line)'},
  '.cm-gutterElement':{padding:'0 8px 0 12px'},
  '.cm-activeLine,.cm-activeLineGutter':{backgroundColor:'var(--editor-active,#7787b90d)'},
  '.cm-cursor,.cm-dropCursor':{borderLeftColor:'var(--ink)'},
  '&.cm-focused .cm-selectionBackground,.cm-selectionBackground':{backgroundColor:'var(--editor-selection,#758cda35)'},
  '.cm-panels':{backgroundColor:'var(--solid)',color:'var(--ink)',fontFamily:'var(--font)',fontSize:'12px'},
  '.cm-search':{padding:'8px'},
  '.cm-textfield':{backgroundColor:'var(--panel)',color:'var(--ink)',border:'1px solid var(--line)',borderRadius:'5px',padding:'4px 6px'},
  '.cm-button':{backgroundImage:'none',backgroundColor:'var(--panel)',color:'var(--ink)',border:'1px solid var(--line)',borderRadius:'5px'}
});

export function createCodeState(doc,{language='python',extensions=[]}={}){
  return EditorState.create({doc,extensions:[
    lineNumbers(),highlightActiveLineGutter(),history(),drawSelection(),highlightActiveLine(),indentOnInput(),
    EditorState.tabSize.of(4),indentUnit.of('    '),
    languageSupport[language](),syntaxHighlighting(highlighting),theme,
    keymap.of([indentWithTab,...defaultKeymap,...historyKeymap,...searchKeymap]),...extensions
  ]});
}

export function mountCodeMirror({textarea,language,bridge,onRun}){
  const host=document.createElement('div');host.className='code-editor-host';
  const shadow=host.attachShadow({mode:'open'});
  if(!('adoptedStyleSheets' in shadow)||!globalThis.CSSStyleSheet)throw new Error('Constructable stylesheets unavailable');
  textarea.before(host);
  let view,disposed=false,composing=false;
  const run=editor=>{if(editor.composing||composing)return false;bridge.flush();onRun?.();return true;};
  try{
    view=new EditorView({parent:shadow,root:shadow,state:createCodeState(textarea.value,{language,extensions:[
      EditorView.contentAttributes.of({'aria-label':'代码编辑器',spellcheck:'false',autocapitalize:'off'}),
      Prec.high(keymap.of([{key:'Mod-Enter',run},{key:'Ctrl-Enter',run}])),
      EditorView.updateListener.of(update=>{if(update.docChanged)bridge.sync(update.state.doc.toString(),{composing:composing||update.view.composing});}),
      EditorView.domEventHandlers({
        compositionstart(){composing=true;},
        compositionend(){composing=false;queueMicrotask(()=>{if(!disposed)bridge.sync(view.state.doc.toString());});}
      })
    ]})});
    if(!shadow.adoptedStyleSheets.some(sheet=>sheet.cssRules.length))throw new Error('Editor stylesheet unavailable');
  }catch(error){view?.destroy();host.remove();throw error;}
  return {
    focus(){view.focus();},
    flush(){bridge.capture(view.state.doc.toString());},
    destroy(){disposed=true;view.destroy();host.remove();}
  };
}
