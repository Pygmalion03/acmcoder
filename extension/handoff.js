import {createHandoffVault,HANDOFF_ORIGINS,validateHandoff} from '../shared/handoff.js';
export const SITE_ORIGIN='https://acmcoder-unified-preview.pages.dev';
export function installHandoff(){
  const storage=chrome.storage.session;
  storage.setAccessLevel?.({accessLevel:'TRUSTED_CONTEXTS'});
  const vault=createHandoffVault({storage});
  const extensionOrigin=`chrome-extension://${chrome.runtime.id}`;
  chrome.runtime.onMessage.addListener((message,sender,respond)=>{
    if(!message?.type?.startsWith('ACMCODER_HANDOFF_'))return false;
    const url=new URL(sender.url||'https://invalid.invalid');
    const trusted=sender.id===chrome.runtime.id&&url.protocol==='chrome-extension:'&&url.host===chrome.runtime.id&&url.pathname==='/workspace.html';
    const website=sender.id===chrome.runtime.id&&HANDOFF_ORIGINS.includes(url.origin)&&Number.isInteger(sender.tab?.id);
    (async()=>{
      if(message.type==='ACMCODER_HANDOFF_CREATE'){
        if(!trusted&&!website)throw new Error('接续来源不匹配。');
        // Create the exact destination before exposing a nonce; no arbitrary URL proxy.
        validateHandoff(message.records);
        const tab=await chrome.tabs.create({url:'about:blank'});
        const targetOrigin=trusted?SITE_ORIGIN:extensionOrigin;
        const envelope=await vault.create({records:message.records,source:trusted?'extension':'website',targetOrigin,targetTabId:tab.id});
        await chrome.tabs.update(tab.id,{url:trusted?`${SITE_ORIGIN}/#handoff=${envelope.nonce}`:chrome.runtime.getURL(`workspace.html#handoff=${envelope.nonce}`)});
        return {opened:true};
      }
      if(message.type==='ACMCODER_HANDOFF_CONSUME'){
        if(!trusted&&!website)throw new Error('接续来源不匹配。');
        let tabId=sender.tab?.id;
        if(trusted){
          const tab=Number.isInteger(message.tabId)?await chrome.tabs.get(message.tabId):null;
          if(tab&&new URL(tab.url).protocol===url.protocol&&new URL(tab.url).host===url.host&&new URL(tab.url).pathname==='/workspace.html')tabId=tab.id;
          else{const tabs=await chrome.tabs.query({});tabId=tabs.find(t=>t.url===sender.url)?.id;}
        }
        return vault.consume({nonce:message.nonce,targetOrigin:trusted?extensionOrigin:url.origin,targetTabId:tabId});
      }
      throw new Error('接续接口不存在。');
    })().then(result=>respond({ok:true,result}),error=>respond({ok:false,error:error.message}));
    return true;
  });
}
