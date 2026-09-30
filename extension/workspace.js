import {createExtensionStore,migrateExtensionDrafts} from './store.js';
import {mountWorkspace} from './shared/ui/workspace.js';
import {createExtensionRunner} from './runner.js';
import {captureCurrentProblem,fetchProblemUrl} from './capture.js';
const store=createExtensionStore();
const frame=document.createElement('iframe');frame.hidden=true;frame.title='隔离 Python';document.body.append(frame);
const status=document.getElementById('capture-status');
async function main(){
  await migrateExtensionDrafts({store});
  const runner=await createExtensionRunner({frame});
  const catalog=await fetch(chrome.runtime.getURL('shared/catalog.json')).then(r=>r.json());
  const workspace=await mountWorkspace(document.getElementById('app'),{store,runner,catalog:catalog.entries,client:{name:'extension',fetchProblem:fetchProblemUrl,description:'插件内离线运行 · 最长 5 秒',storage:'当前数据保存在此插件。请在卸载前导出备份。',legacyUrl:chrome.runtime.getURL('sidebar.html')}});
  const button=document.getElementById('capture-current');
  button.onclick=async()=>{
    button.disabled=true;status.textContent='正在读取题面…';
    try{
      const captured=await captureCurrentProblem();
      const problems=await store.listRecords({kind:'problem'});
      const existing=problems.find(p=>p.id===captured.id||p.payload.sourceUrl===captured.payload.sourceUrl);
      if(existing){await workspace.navigate('practice',existing.id);status.textContent='题目已存在，已保留原代码和历史。';}
      else{await store.putRecord(captured);await workspace.navigate('practice',captured.id);status.textContent='题面和样例已导入，请自行编写 ACM 输入输出。';}
    }catch(error){status.textContent=error.message;}
    finally{button.disabled=false;}
  };
}
main().catch(error=>{status.textContent=`侧栏无法启动：${error.message}。原数据保留，可打开旧本地侧栏。`;const link=document.createElement('a');link.href=chrome.runtime.getURL('sidebar.html');link.textContent='旧本地侧栏';document.getElementById('app').append(link);});
