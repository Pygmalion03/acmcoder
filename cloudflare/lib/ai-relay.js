import {createChatTransport,normalizeProvider} from '../../shared/ai.js';
export const AI_RELAY_BASES=['https://api.openai.com/v1','https://api.deepseek.com','https://api.deepseek.com/v1','https://api.siliconflow.cn/v1','https://dashscope.aliyuncs.com/compatible-mode/v1'];
export function validateAIRequest(data,options={}){
 if(typeof data?.key!=='string'||!data.key.trim()||data.key.length>4096||/[\r\n]/.test(data.key)||!Array.isArray(data.messages)||!data.messages.length||data.messages.length>17||data.messages.some(m=>!['system','user','assistant'].includes(m.role)||typeof m.content!=='string'||m.content.length>13000)||JSON.stringify(data.messages).length>50000)throw new Error('问答请求格式无效。');
 return {provider:normalizeProvider(data.provider,options),key:data.key,messages:data.messages.map(({role,content})=>({role,content}))};
}
export async function relayAI(data,{fetch=globalThis.fetch,signal}={}){
 const input=validateAIRequest(data);
 return createChatTransport({fetch,allowedBases:AI_RELAY_BASES})({...input,signal});
}
