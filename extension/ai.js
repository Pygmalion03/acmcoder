import {createChatTransport,normalizeProvider} from './shared/ai.js';
export function createExtensionAI(){
 const transport=createChatTransport();
 return {allowLoopback:false,description:'插件直连你选择的 HTTPS 服务；先授予该服务的访问权限。',
  async prepare(provider){const {baseUrl}=normalizeProvider(provider),origin=`${new URL(baseUrl).origin}/*`;if(!await chrome.permissions.request({origins:[origin]}))throw new Error('未获得此 API 服务的访问权限。');},
  async transport(input){const origin=`${new URL(input.provider.baseUrl).origin}/*`;if(!await chrome.permissions.contains({origins:[origin]}))throw new Error('请在设置中保存配置，授予此 API 服务的访问权限。');return transport(input);}
 };
}
