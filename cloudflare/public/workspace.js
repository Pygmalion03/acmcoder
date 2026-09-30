import {createBrowserStore} from '/shared/browser-store.js';
import {createBrowserRunner} from '/shared/runner.js';
import {mountWorkspace} from '/shared/ui/workspace.js';
import {migrateBrowserDrafts} from '/shared/legacy-browser.js';
import {createSyncEngine,createSyncTransport} from '/shared/sync.js';
import {createWebsiteHandoff} from '/shared/handoff-client.js';
import {offerHandoff} from '/shared/handoff-ui.js';

async function main(){
  const frame=document.createElement('iframe');
  frame.hidden=true;frame.setAttribute('sandbox','allow-scripts');frame.title='隔离 Python 运行环境';document.body.append(frame);
  const session=await fetch('/api/auth/session').then(r=>r.ok?r.json():null).catch(()=>null);
  const pendingConnection=sessionStorage.getItem('acmcoder-device-return');
  if(session?.authenticated&&/^\/connect\.html\?code=[A-F0-9]{10}$/.test(pendingConnection||'')){
    sessionStorage.removeItem('acmcoder-device-return');location.replace(pendingConnection);return;
  }
  const nonce=new URLSearchParams(location.hash.slice(1)).get('handoff');
  const user=!nonce&&session?.authenticated?session.user:null;
  const namespace=user?`account:${user.id}`:'guest';
  const store=createBrowserStore({namespace,sync:!!user});
  await migrateBrowserDrafts({store,namespace});
  const runner=createBrowserRunner({frame});
  let engine,workspace,timer;
  const statusText=()=>({quota:'今日云端自测额度已用完，运行结果保留本机；其他内容继续同步',saved:'已同步到云端',syncing:'正在同步…',conflict:'发现修改冲突，双方内容已保留',paused:'同步已暂停，请重新连接账号',retrying:'网络暂不可用，稍后自动重试；内容已保留',error:'同步暂未完成；本机内容已保留',idle:'已保存到此设备'}[engine?.getStatus().state]||'已保存到此设备');
  async function deviceCall(path,data){const response=await fetch(`/api/devices${path}`,{method:data?'POST':'GET',headers:data?{'content-type':'application/json'}:{},...(data?{body:JSON.stringify(data)}:{})});const result=await response.json();if(!response.ok)throw new Error(result.error||'设备管理暂不可用。');return result;}
  const account={async usage(){const response=await fetch('/api/account/usage',{headers:{'x-acm-expected-user':user.id}});const result=await response.json();if(!response.ok)throw new Error(result.error||'云端容量暂不可用。');return result;},async deleteCloud(){const response=await fetch('/api/account',{method:'DELETE',headers:{'content-type':'application/json','x-acm-expected-user':user.id},body:JSON.stringify({confirmation:'DELETE'})});if(!response.ok)throw new Error((await response.json()).error||'删除未完成。');clearTimeout(timer);engine.pause();location.reload();},devices:async()=>(await deviceCall('')).devices,revoke:deviceId=>deviceCall('/revoke',{deviceId}),user,loginAvailable:!!session?.loginAvailable,statusText,async sync(){await engine.syncNow();},async mergeGuest(){
    const guest=createBrowserStore({namespace:'guest'});const result=await store.restoreBackup(await guest.exportBackup());
    // Incoming restore conflicts remain available after refresh.
    await store.setMeta('guest-merge-conflicts',result.conflicts);await engine.syncNow();return result;
  },async logout(){
    clearTimeout(timer);engine.pause();await store.flush();
    const response=await fetch('/api/auth/logout',{method:'POST'});if(!response.ok)throw new Error('退出未完成，请重试。');location.reload();
  }};
  if(user){
    engine=createSyncEngine({store,accountId:user.id,transport:createSyncTransport({accountId:user.id}),onStatus(){const el=document.getElementById('sync-status');if(el)el.textContent=statusText();}});
    await engine.syncNow();
    store.subscribe(()=>{clearTimeout(timer);timer=setTimeout(()=>engine.syncNow({automatic:true}),1500);});
    window.addEventListener('online',()=>engine.syncNow());
    // Refresh between visits, not while the user is entering code.
    window.addEventListener('focus',async()=>{await engine.syncNow({automatic:true});if(!['code','stdin','expected'].includes(document.activeElement?.id))await workspace?.refreshFromCloud();});
  }
  const ai={description:'网站通过登录后的短时转发请求；支持 OpenAI、DeepSeek、SiliconFlow 和阿里云兼容地址。',async transport(input){if(!user)throw new Error('网站转发需要先连接 GitHub 账号。');const response=await fetch('/api/ai/chat',{method:'POST',headers:{'content-type':'application/json','x-acm-expected-user':user.id},body:JSON.stringify({provider:input.provider,key:input.key,messages:input.messages}),signal:input.signal});const result=await response.json();if(!response.ok)throw new Error(result.error||'模型连接失败。');return result;}};
  const catalog=await fetch('/shared/catalog.json').then(r=>r.ok?r.json():{entries:[]}).catch(()=>({entries:[]}));
  const handoff=createWebsiteHandoff();
  workspace=await mountWorkspace(document.getElementById('app'),{store,runner,account,catalog:catalog.entries,client:{ai,handoffLabel:'在插件继续 ↗',handoff:records=>handoff.send(records)}});
  if(nonce){
    try{const incoming=await handoff.consume(nonce);history.replaceState(null,'',location.pathname);await offerHandoff({store,records:incoming.records,workspace});}
    catch(error){const note=document.createElement('p');note.textContent=error.message;document.getElementById('app').prepend(note);}
  }
}
main().catch(error=>{const message=document.createElement('p');message.textContent=`工作区暂时无法打开：${error.message}。原有数据不会被删除。`;document.getElementById('app').append(message);});
