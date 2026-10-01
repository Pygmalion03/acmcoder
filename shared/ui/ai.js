import {createAIClient,normalizeProvider} from '../ai.js';
import {createCredentialVault} from '../credential-vault.js';
const escape=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export async function createAIPanel({store,adapter}){
 const vault=createCredentialVault({name:`acmcoder-ai-vault-v1:${store.namespace}`}),client=createAIClient({store,credentials:vault,transport:adapter.transport});
 let provider=(await store.getRecord({kind:'settings',id:'ai-provider'}))?.payload||{baseUrl:'https://api.openai.com/v1',model:'',allowLoopback:false};
 let panel=null,current=null,finding=null;
 const pending=new Map();
 async function mount(container,{problemId,language,context}={}){
  panel=container;current=problemId?{problemId,language,context}:null;
  if(!current){
   container.innerHTML=`<h3>自带 API</h3><p class="muted">兼容 chat-completions 协议。${escape(adapter.description||'')} 模型费用由你的提供商收取。</p><div class="api-fields"><label>API 地址<input id="ai-base" type="url" value="${escape(provider.baseUrl)}"></label><label>模型名称<input id="ai-model" value="${escape(provider.model)}" placeholder="填写提供商的模型 ID"></label></div>${adapter.allowLoopback?`<label><input type="checkbox" id="ai-loopback" ${provider.allowLoopback?'checked':''}> 允许本机回环 HTTP 模型服务</label>`:''}<p id="ai-key-status" class="muted">${{ready:'密钥已就绪',locked:'已加密保存，需解锁',empty:'尚未设置密钥'}[vault.status()]}</p><div class="api-fields"><label>API 密钥<input id="ai-key" type="password" autocomplete="off" placeholder="留空保留当前密钥"></label><label>解锁口令<input id="ai-password" type="password" autocomplete="off" placeholder="至少 8 位，仅用于本机加密"></label></div><label><input id="ai-remember" type="checkbox"> 使用口令加密记住；重启后需解锁</label><div class="actions"><button id="ai-save">保存配置</button><button id="ai-unlock">解锁</button><button id="ai-clear">清除密钥</button><button id="ai-test">测试连接</button></div><p class="muted">默认密钥只留在当前应用会话；不会进入题库、历史、备份或同步。口令不会保存。</p><p id="ai-config-status" role="status"></p>`;
   const $=s=>container.querySelector(s),status=t=>{$('#ai-config-status').textContent=t;},update=()=>{$('#ai-key-status').textContent={ready:'密钥已就绪',locked:'已加密保存，需解锁',empty:'尚未设置密钥'}[vault.status()];};
   $('#ai-save').onclick=async()=>{
    const target=$('#ai-save');target.disabled=true;
    try{
     const next=normalizeProvider({baseUrl:$('#ai-base').value,model:$('#ai-model').value},{allowLoopback:!!$('#ai-loopback')?.checked});
     next.allowLoopback=!!$('#ai-loopback')?.checked;
     await adapter.prepare?.(next);
     const key=$('#ai-key').value;if(key)await vault.set(next.baseUrl,key,{remember:$('#ai-remember').checked,password:$('#ai-password').value});
     if(provider.baseUrl!==next.baseUrl&&!key)vault.lock();
     await store.putRecord({kind:'settings',id:'ai-provider',payload:next});provider=next;
     $('#ai-key').value='';$('#ai-password').value='';update();status('配置已保存。');
    }catch(error){status(error.message);}finally{target.disabled=false;}
   };
   $('#ai-unlock').onclick=async()=>{try{await vault.unlock($('#ai-password').value);$('#ai-password').value='';update();status('已解锁。');}catch(error){status(error.message);}};
   $('#ai-clear').onclick=()=>{client.cancelAll();finding?.abort();vault.clear();$('#ai-key').value='';$('#ai-password').value='';update();status('密钥已清除。');};
   $('#ai-test').onclick=async()=>{const target=$('#ai-test');target.disabled=true;const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),15000);try{const key=vault.get(provider.baseUrl);if(!key)throw new Error('请先保存或解锁密钥。');await adapter.transport({provider,key,messages:[{role:'user',content:'Reply OK.'}],signal:controller.signal});status('连接成功，模型已返回文本。');}catch(error){status(error.message);}finally{clearTimeout(timeout);target.disabled=false;}};
   return;
  }
  const captured=current,id=`${problemId}--${language}`,record=await store.getRecord({kind:'conversation',id});let input=await store.getMeta(`ai-input:${id}`)||{};
  if(current!==captured)return;
  container.innerHTML=`<h3>AI 问答</h3><p class="muted">按你的问题直接回答，代码由你决定如何修改。</p><div class="ai-history-toolbar"><span id="ai-history-range" class="muted"></span><div class="actions"><button id="ai-older">更早的对话</button><button id="ai-newer">更新的对话</button><button id="ai-latest">回到最新</button></div></div><div id="ai-messages" role="region" aria-label="AI 对话历史" tabindex="0"></div><label>你的问题<textarea id="ai-question" maxlength="12000">${escape(input.question||'')}</textarea></label><label><input id="ai-context" type="checkbox" ${input.includeContext?'checked':''}> 附带当前题面、代码和输入</label><div class="actions"><button id="ai-send" ${pending.has(id)?'disabled':''}>发送</button><button id="ai-cancel">停止回答</button></div><p id="ai-chat-status" role="status">${pending.has(id)?'正在等待模型回答…':vault.status()==='ready'?'':'请到设置与数据中配置或解锁 API 密钥。'}</p>`;
  const $=s=>container.querySelector(s),status=t=>{if(panel===container&&current===captured)$('#ai-chat-status').textContent=t;};
  const messages=record?.payload.messages||[],pageSize=20;let end=messages.length;
  const showHistory=(atLatest=false)=>{
   const start=Math.max(0,end-pageSize),transcript=$('#ai-messages');
   transcript.innerHTML=messages.slice(start,end).map(m=>`<div class="ai-message"><strong>${m.role==='user'?'你':'AI'}</strong><pre>${escape(m.content)}</pre></div>`).join('')||'<p class="muted ai-empty">还没有对话，从下面开始提问。</p>';
   $('#ai-history-range').textContent=messages.length?`第 ${start+1}–${end} 条 · 共 ${messages.length} 条，完整历史已保留`:'对话会自动保存';
   $('#ai-older').disabled=start===0;$('#ai-newer').disabled=end===messages.length;$('#ai-latest').disabled=end===messages.length;
   transcript.scrollTop=atLatest?transcript.scrollHeight:0;
  };
  $('#ai-older').onclick=()=>{end=Math.max(0,end-pageSize);showHistory();};
  $('#ai-newer').onclick=()=>{end=Math.min(messages.length,end+pageSize);showHistory(end===messages.length);};
  $('#ai-latest').onclick=()=>{end=messages.length;showHistory(true);};
  showHistory(true);
  const drawer=container.closest('.practice-ai');if(drawer)drawer.ontoggle=()=>{if(drawer.open&&end===messages.length)$('#ai-messages').scrollTop=$('#ai-messages').scrollHeight;};
  const saveInput=()=>{const question=$('#ai-question').value;input={...input,requestId:input.question===question?input.requestId:undefined,question,includeContext:$('#ai-context').checked};return store.setMeta(`ai-input:${id}`,input);};
  $('#ai-question').oninput=()=>saveInput().catch(error=>status(error.message));$('#ai-context').onchange=()=>saveInput().catch(error=>status(error.message));
  $('#ai-cancel').onclick=()=>{if(pending.has(id))client.cancel(pending.get(id));};
  $('#ai-send').onclick=async()=>{
   const question=$('#ai-question').value,includeContext=$('#ai-context').checked;
   const requestId=input.requestId&&input.question===question?input.requestId:crypto.randomUUID();pending.set(id,requestId);$('#ai-send').disabled=true;status('正在等待模型回答…');
   try{
    input={question,includeContext,requestId};await store.setMeta(`ai-input:${id}`,input);
    await client.chat({problemId,language,requestId,provider,question,context:includeContext?context():undefined});
    await store.setMeta(`ai-input:${id}`,{});
   }catch(error){status(error.message);pending.delete(id);if(panel===container&&current===captured)$('#ai-send').disabled=false;return;}
   pending.delete(id);if(panel===container&&current===captured)await mount(container,captured);
  };
 }
 return {mount,async findProblems(text,{original}){
  const key=vault.get(provider.baseUrl);if(!key)throw new Error('请先到设置中配置或解锁 API 密钥。');
  finding?.abort();const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),60000);finding=controller;
  try{const result=await adapter.transport({provider,key,signal:controller.signal,messages:[{role:'system',content:original?'用户明确要求原创。只返回 JSON {"candidates":[{"title":"题名","sourceKind":"ai-original","statement":"完整 ACM 题面及输入输出格式","cases":[{"stdin":"样例输入","expected":"样例输出"}]}]}。不得声称来自 LeetCode。':'匹配 LeetCode 题目，只返回 JSON {"candidates":[{"title":"题名","sourceUrl":"https://leetcode.cn/problems/slug/"}]}，最多五项。不编造已抓取或已验证，不输出题面。没有把握返回空 candidates。'},{role:'user',content:text}]});return result.message;}
  finally{clearTimeout(timeout);if(finding===controller)finding=null;}
 },destroy:()=>{client.cancelAll();finding?.abort();}};
}
