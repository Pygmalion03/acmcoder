import {createBrowserStore} from '/shared/browser-store.js';
import {createBrowserRunner} from '/shared/runner.js';
import {mountWorkspace} from '/shared/ui/workspace.js';
import {migrateBrowserDrafts} from '/shared/legacy-browser.js';

const frame=document.createElement('iframe');
frame.hidden=true;frame.setAttribute('sandbox','allow-scripts');frame.title='隔离 Python 运行环境';
document.body.append(frame);
const store=createBrowserStore({namespace:'guest'});
await migrateBrowserDrafts({store,namespace:'guest'});
const runner=createBrowserRunner({frame});
const catalog=await fetch('/shared/catalog.json').then(r=>r.ok?r.json():{entries:[]}).catch(()=>({entries:[]}));
mountWorkspace(document.getElementById('app'),{store,runner,catalog:catalog.entries}).catch(error=>{
  const message=document.createElement('p');message.textContent=`工作区暂时无法打开：${error.message}。原有数据不会被删除。`;document.getElementById('app').append(message);
});
