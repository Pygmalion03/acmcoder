export function normalizeProvider(input,{allowLoopback=false}={}){
 let url;try{url=new URL(String(input?.baseUrl||''));}catch{throw new Error('API 地址无效。');}
 const loopback=['localhost','127.0.0.1','[::1]'].includes(url.hostname);
 if(url.username||url.password||url.search||url.hash||!(url.protocol==='https:'||allowLoopback&&loopback&&url.protocol==='http:'))throw new Error('API 地址需为 HTTPS；本地服务可显式使用回环 HTTP。');
 const model=String(input?.model||'').trim();if(!model||model.length>200)throw new Error('请填写模型名称。');
 return {baseUrl:url.href.replace(/\/+$/,''),model};
}
export const redactKey=(text,key)=>key?String(text).split(key).join('[密钥已隐藏]'):String(text);
export function contextMessages(messages,context){
 const kept=[];let size=0;
 for(const m of [...messages].reverse()){
  if(!['user','assistant'].includes(m.role)||typeof m.content!=='string')continue;
  const content=m.content.slice(0,12000);if(kept.length>=16||size+content.length>24000)break;size+=content.length;kept.unshift({role:m.role,content});
 }
 if(context)kept.unshift({role:'system',content:`用户选择附带当前练习内容，供本次问答参考：\n${JSON.stringify(context).slice(0,12000)}`});
 return kept;
}
export function createChatTransport({fetch:request=globalThis.fetch,allowLoopback=false,allowedBases=null}={}){
 return async ({provider,key,messages,signal})=>{
  const normalized=normalizeProvider(provider,{allowLoopback});
  if(allowedBases&&!allowedBases.includes(normalized.baseUrl))throw new Error('网站暂不支持转发此 API 地址，请使用插件或本地版。');
  let response;
  try{response=await request(`${normalized.baseUrl}/chat/completions`,{method:'POST',redirect:'error',headers:{'content-type':'application/json',authorization:`Bearer ${key}`},body:JSON.stringify({model:normalized.model,messages,stream:false}),signal});}
  catch(error){if(signal?.aborted)throw new Error('问答已取消。');throw new Error('模型连接失败，请检查 API 地址和网络。');}
  if(!response.ok){await response.body?.cancel();throw new Error(`模型服务返回 ${response.status}，请检查密钥、模型或服务额度。`);}
  const reader=response.body.getReader();let bytes=0,text='';const decoder=new TextDecoder();
  while(true){const {done,value}=await reader.read();if(done)break;bytes+=value.length;if(bytes>1024*1024){await reader.cancel();throw new Error('模型回复超过上限。');}text+=decoder.decode(value,{stream:true});}
  text+=decoder.decode();let data;try{data=JSON.parse(text);}catch{throw new Error('模型返回格式不兼容。');}
  const content=data.choices?.[0]?.message?.content;if(typeof content!=='string'||!content.trim())throw new Error('模型未返回文本回答。');
  return {message:redactKey(content.slice(0,100000),key)};
 };
}
export function createAIClient({store,transport,credentials}){
 const active=new Map(),busy=new Set();
 return {
  cancel(requestId){active.get(requestId)?.abort();},
  cancelAll(){for(const controller of active.values())controller.abort();},
  async chat({requestId,problemId,language,provider,question,context,signal}){
   if(!/^[a-zA-Z0-9_-]{1,100}$/.test(requestId||'')||!question?.trim()||question.length>12000)throw new Error('请输入问题（最多 12000 字）。');
   const key=credentials.get(provider.baseUrl);if(!key)throw new Error('请先配置或解锁 API 密钥。');
   const id=`${problemId}--${language}`,saved=await store.getRecord({kind:'conversation',id});
   const existing=saved?.payload.messages.find(m=>m.requestId===requestId&&m.role==='assistant');if(existing)return {message:existing.content};
   if(busy.has(id))throw new Error('此题已有问答正在进行。');busy.add(id);
   const controller=new AbortController();active.set(requestId,controller);const cancel=()=>controller.abort();signal?.addEventListener('abort',cancel,{once:true});if(signal?.aborted)cancel();
   const timeout=setTimeout(cancel,60000);timeout?.unref?.();
   const payload=structuredClone(saved?.payload||{messages:[]});
   if(!payload.messages.some(m=>m.requestId===requestId))payload.messages.push({role:'user',content:redactKey(question.trim(),key),requestId});
   const record={kind:'conversation',id,problemId,language,payload};
   try{
    await store.putRecord(record);
    const result=await transport({provider,key,messages:contextMessages(payload.messages,context),signal:controller.signal});
    if(controller.signal.aborted)throw new Error('问答已取消。');
    if(await store.getMeta(`deleted:${problemId}`))throw new Error('题目已删除，回答不再保存。');
    const message=redactKey(result.message,key);payload.messages.push({role:'assistant',content:message,requestId});await store.putRecord(record);return {message};
   }catch(error){if(controller.signal.aborted)throw new Error('问答已取消。');throw new Error(redactKey(error.message,key));}
   finally{clearTimeout(timeout);signal?.removeEventListener('abort',cancel);active.delete(requestId);busy.delete(id);}
  }
 };
}
