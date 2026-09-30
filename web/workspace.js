import {createLocalClient} from './unified-store.js';
import {mountWorkspace} from '/shared/ui/workspace.js';
import {templates} from '/shared/practice.js';
import {migrateLocalDrafts} from './legacy-local.js';

async function main(){
  const local=await createLocalClient(),session=await local.call('session'),store=local.store(session.namespace);await store.recover();
  if(session.namespace==='local-guest')await migrateLocalDrafts(store);
  let syncState={state:'idle'},workspace;
  const account={user:session.user,connect:async()=>{
    const request=await local.call('connect',{}),dialog=document.createElement('dialog');
    dialog.innerHTML='<h2>连接云端账号</h2><p>在网站登录并确认设备后，回到这里继续。</p><p id="device-code"></p><a target="_blank" rel="noopener noreferrer">打开确认页面 ↗</a><p role="status"></p><button type="button">取消</button>';
    dialog.querySelector('#device-code').textContent=`校验码：${request.userCode}`;dialog.querySelector('a').href=request.verificationUrl;document.body.append(dialog);dialog.showModal();
    let timer=null,active=true;const stop=()=>{active=false;clearTimeout(timer);};dialog.querySelector('button').onclick=()=>dialog.close();dialog.addEventListener('close',()=>{stop();local.call('cancel',{}).catch(()=>{});dialog.remove();});
    async function poll(){if(!active)return;try{const result=await local.call('poll',{});if(!active)return;if(result.state==='connected'){stop();location.reload();return;}if(result.state==='expired'){dialog.querySelector('[role=status]').textContent='请求已过期，请关闭后重新连接。';return;}}catch(error){dialog.querySelector('[role=status]').textContent=error.message;}if(active)timer=setTimeout(poll,5000);}
    poll();
  },statusText:()=>({saved:'已同步到云端',syncing:'正在同步…',conflict:'发现修改冲突，双方已保留',paused:'连接已暂停，请重新连接',error:'同步暂未完成，本地文件已保留'}[syncState.state]||'已保存到本地文件'),async sync(){syncState=await local.call('sync',{namespace:store.namespace});},async logout(){await store.flush();await local.call('disconnect',{});location.reload();},async mergeGuest(){const guest=local.store('local-guest'),result=await store.restoreBackup(await guest.exportBackup());await account.sync();return result;}};
  if(session.user)await account.sync();
  const token=(await fetch('/api/session').then(r=>r.json())).token;
  const running=new Map();
  const runner={async run(input,emit){const controller=new AbortController();running.set(input.id,controller);emit({type:'running',id:input.id});try{const response=await fetch('/api/run',{method:'POST',headers:{'content-type':'application/json','x-acmcoder-token':token},signal:controller.signal,body:JSON.stringify({...input,expected:'',timeoutMs:5000})});const data=await response.json();if(!response.ok)throw new Error(data.error);const r=data.result;emit({type:'stdout',text:r.stdout||'',id:input.id});emit({type:'stderr',text:r.stderr||'',id:input.id});if(!['AC','WA','UNKNOWN','CANCELLED'].includes(r.status)){const result={type:'error',kind:'error',text:r.stderr||r.status,id:input.id};emit(result);return result;}const result={type:'complete',kind:'complete',id:input.id};emit(result);return result;}catch(error){const result=error.name==='AbortError'?{type:'cancelled',kind:'complete',cancelled:true,id:input.id}:{type:'error',kind:'error',text:error.message,id:input.id};emit(result);return result;}finally{running.delete(input.id);}},cancel(id){fetch('/api/run/cancel',{method:'POST',headers:{'content-type':'application/json','x-acmcoder-token':token},body:JSON.stringify({id})}).catch(()=>{});running.get(id)?.abort();},destroy(){for(const id of running.keys())this.cancel(id);}};
  const catalog=await fetch('/api/recommendation/catalog').then(r=>r.json()).then(r=>r.catalog?.entries||[]).catch(()=>[]);
  workspace=await mountWorkspace(document.getElementById('app'),{store,runner,account,catalog,client:{fetchProblem:async url=>{const response=await fetch('/api/import/fetch',{method:'POST',headers:{'content-type':'application/json','x-acmcoder-token':token},body:JSON.stringify({url})});const data=await response.json();if(!response.ok)throw new Error(data.error);return data;},languages:['python','cpp','java'],description:'本地工具链运行 · 最长 5 秒',storage:'题目、草稿与历史保存在本地服务的数据目录；浏览器关闭后仍保留。',legacyUrl:'/legacy.html'}});
}
main().catch(error=>{document.getElementById('app').textContent=`本地工作区暂时无法打开：${error.message}。原数据保留，可打开 /index.html 使用原版。`;});
