import {createExtensionStore,migrateExtensionDrafts} from './store.js';
import {mountWorkspace} from './shared/ui/workspace.js';
import {createExtensionRunner} from './runner.js';
import {captureCurrentProblem,fetchProblemUrl} from './capture.js';
import {offerHandoff} from './shared/handoff-ui.js';
import {createExtensionAuth} from './auth.js';
import {createSyncEngine} from './shared/sync.js';
const frame=document.createElement('iframe');frame.hidden=true;frame.title='隔离 Python';document.body.append(frame);
const status=document.getElementById('capture-status');
async function main(){
  const auth=createExtensionAuth(),session=await auth.status();
  const nonce=new URLSearchParams(location.hash.slice(1)).get('handoff');
  const user=nonce?null:session.user;
  const store=createExtensionStore({namespace:user?`account:${user.id}`:'extension-guest',sync:!!user});
  if(!user)await migrateExtensionDrafts({store});
  let engine,workspace,timer;
  const statusText=()=>({saved:'已同步到云端',syncing:'正在同步…',conflict:'发现修改冲突，双方内容已保留',paused:'连接已暂停，请重新连接账号',error:'同步暂未完成，本机练习已保留'}[engine?.getStatus().state]||'已保存到此插件');
  const account={user,loginAvailable:true,statusText,connect:async remember=>{await store.flush();await auth.connect(remember);location.reload();},sync:()=>engine.syncNow(),async mergeGuest(){
    const guest=createExtensionStore();const result=await store.restoreBackup(await guest.exportBackup());await store.setMeta('guest-merge-conflicts',result.conflicts);await engine.syncNow();return result;
  },async logout(){clearTimeout(timer);engine?.pause();await store.flush();await auth.logout();location.reload();}};
  if(user){engine=createSyncEngine({store,accountId:user.id,transport:auth.transport(user.id),onStatus(){const el=document.getElementById('sync-status');if(el)el.textContent=statusText();}});await engine.syncNow();store.subscribe(()=>{clearTimeout(timer);timer=setTimeout(()=>engine.syncNow(),1500);});window.addEventListener('online',()=>engine.syncNow());window.addEventListener('focus',async()=>{await engine.syncNow();if(!['code','stdin','expected'].includes(document.activeElement?.id))await workspace?.refreshFromCloud();});}
  const runner=await createExtensionRunner({frame});
  const catalog=await fetch(chrome.runtime.getURL('shared/catalog.json')).then(r=>r.json());
  workspace=await mountWorkspace(document.getElementById('app'),{store,runner,account,catalog:catalog.entries,client:{name:'extension',fetchProblem:fetchProblemUrl,handoffLabel:'在网站继续 ↗',handoff:async records=>{const response=await chrome.runtime.sendMessage({type:'ACMCODER_HANDOFF_CREATE',records});if(!response?.ok)throw new Error(response?.error||'接续失败。');},description:'插件内离线运行 · 最长 5 秒',storage:'当前数据保存在此插件。请在卸载前导出备份。',legacyUrl:chrome.runtime.getURL('sidebar.html')}});
  if(nonce){
    try{const response=await chrome.runtime.sendMessage({type:'ACMCODER_HANDOFF_CONSUME',nonce,tabId:(await chrome.tabs.getCurrent())?.id});if(!response?.ok)throw new Error(response?.error||'接续失效。');history.replaceState(null,'',location.pathname);await offerHandoff({store,records:response.result.records,workspace});}
    catch(error){status.textContent=error.message;}
  }
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
