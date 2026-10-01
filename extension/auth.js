const SITE='https://acmcoder-unified-preview.pages.dev';
const SESSION_KEY='acmcoder.device.session',PERSIST_KEY='acmcoder.device.refresh';
const PENDING_KEY='acmcoder.device.pending';
const allowedPath=path=>path==='records/migrate'||path==='sync/push'||/^sync\/pull\?cursor=\d+&limit=50$/.test(path);
const random=()=>Array.from(crypto.getRandomValues(new Uint8Array(32)),b=>b.toString(16).padStart(2,'0')).join('');
async function challenge(value){return btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))))).replaceAll('+','-').replaceAll('/','_').replaceAll('=','');}

// Called only by the service worker. Neither the content script nor sandbox receives tokens.
export function installDeviceAuth(){
  let refreshWork=null,connectWork=null,pollWork=null,epoch=0,credentialWork=Promise.resolve();
  function serialize(work){const result=credentialWork.then(work);credentialWork=result.catch(()=>{});return result;}
  const failure=(message,code)=>Object.assign(new Error(message),{code});
  const ready=Promise.all([chrome.storage.local.setAccessLevel({accessLevel:'TRUSTED_CONTEXTS'}),chrome.storage.session.setAccessLevel({accessLevel:'TRUSTED_CONTEXTS'})]);
  async function read(){await ready;await credentialWork;return (await chrome.storage.session.get(SESSION_KEY))[SESSION_KEY]||(await chrome.storage.local.get(PERSIST_KEY))[PERSIST_KEY]||null;}
  function write(value,expectedEpoch){return serialize(async()=>{
    if(expectedEpoch!==epoch)throw new Error('账号连接已取消。');
    await chrome.storage.session.set({[SESSION_KEY]:value});
    if(value.remember)await chrome.storage.local.set({[PERSIST_KEY]:{refreshToken:value.refreshToken,refreshExpiresAt:value.refreshExpiresAt,user:value.user,deviceId:value.deviceId,remember:true}});
    else await chrome.storage.local.remove(PERSIST_KEY);
  });}
  function clear(){epoch++;return serialize(async()=>{await ready;await Promise.all([chrome.storage.session.remove([SESSION_KEY,PENDING_KEY]),chrome.storage.local.remove(PERSIST_KEY)]);});}
  async function request(path,data,token){
    const response=await fetch(`${SITE}/api/${path}`,{method:data?'POST':'GET',credentials:'omit',cache:'no-store',signal:AbortSignal.timeout(20000),headers:{...(data?{'content-type':'application/json'}:{}),...(token?{authorization:`Bearer ${token}`}:{})},...(data?{body:JSON.stringify(data)}:{})});
    return {status:response.status,data:await response.json()};
  }
  async function active(){
    const saved=await read();if(!saved)throw failure('请先连接账号。','401');
    if(saved.accessToken&&saved.expiresAt>Date.now()+10000)return saved;
    if(!refreshWork){const expectedEpoch=epoch;refreshWork=(async()=>{
      const result=await request('devices/refresh',{refreshToken:saved.refreshToken});
      if(result.status!==200){if(result.status===401)await clear();throw failure('连接已失效，请重新连接；本机练习仍保留。',result.status===401?'401':'network');}
      const next={...saved,...result.data,expiresAt:Date.now()+result.data.expiresIn*1000};await write(next,expectedEpoch);return next;
    })().finally(()=>{refreshWork=null;});}
    return refreshWork;
  }
  async function saveGrant(data,remember,expectedEpoch){
    try{await write({...data,remember:!!remember,expiresAt:Date.now()+data.expiresIn*1000},expectedEpoch);}
    catch(error){
      // Logout can race the exchange. Do not leave its newly issued grant active.
      if(expectedEpoch!==epoch)try{await request('devices/revoke',{},data.accessToken);}catch{}
      throw error;
    }
    return {user:data.user};
  }
  async function connect(remember){
    await ready;await credentialWork;
    const pending=(await chrome.storage.session.get(PENDING_KEY))[PENDING_KEY];
    if(pending&&pending.expiresAt>Date.now())return {pending:true,interval:5};
    await chrome.storage.session.remove(PENDING_KEY);
    const expectedEpoch=epoch,verifier=random(),state=random();
    const start=await request('devices/start',{name:'ACMCoder 浏览器插件',mode:'pkce',codeChallengeMethod:'S256',codeChallenge:await challenge(verifier),state,redirectUri:chrome.identity.getRedirectURL('connect')});
    // Unpacked ZIP installations have path-dependent IDs, so use explicit device
    // approval when this ID has no registered PKCE callback. Never widen callbacks.
    if(start.status===403&&start.data.code==='unregistered_extension'){
      const device=await request('devices/start',{name:'ACMCoder 浏览器插件（ZIP 安装）',mode:'device'});
      if(device.status!==200)throw new Error('暂时无法发起账号连接，请稍后重试。');
      const tab=await chrome.tabs.create({url:device.data.verificationUrl});
      await serialize(async()=>{
        if(expectedEpoch!==epoch)throw new Error('账号连接已取消。');
        await chrome.storage.session.set({[PENDING_KEY]:{deviceCode:device.data.deviceCode,tabId:tab.id,remember:!!remember,expiresAt:Date.now()+device.data.expiresIn*1000,nextPollAt:Date.now()+5000}});
      });
      return {pending:true,interval:5};
    }
    if(start.status!==200)throw new Error('暂时无法发起账号连接，请稍后重试。');
    const returned=await chrome.identity.launchWebAuthFlow({url:start.data.verificationUrl,interactive:true});
    const url=new URL(returned||'https://invalid.local');
    if(url.origin+url.pathname!==chrome.identity.getRedirectURL('connect')||url.searchParams.get('state')!==state)throw new Error('授权回调无效，未连接账号。');
    const result=await request('devices/token',{deviceCode:url.searchParams.get('code'),codeVerifier:verifier});
    if(result.status!==200)throw new Error('授权已过期或被使用，请重新连接。');
    return saveGrant(result.data,remember,expectedEpoch);
  }
  async function poll(){
    await ready;await credentialWork;
    const expectedEpoch=epoch,pending=(await chrome.storage.session.get(PENDING_KEY))[PENDING_KEY];
    if(!pending)throw new Error('账号连接已取消，请重新连接。');
    if(pending.expiresAt<=Date.now()){await chrome.storage.session.remove(PENDING_KEY);throw new Error('授权已过期，请重新连接。');}
    if(pending.nextPollAt>Date.now())return {pending:true,interval:Math.ceil((pending.nextPollAt-Date.now())/1000)};
    await serialize(async()=>{
      if(expectedEpoch!==epoch)throw new Error('账号连接已取消。');
      await chrome.storage.session.set({[PENDING_KEY]:{...pending,nextPollAt:Date.now()+5000}});
    });
    const result=await request('devices/token',{deviceCode:pending.deviceCode});
    if(result.status===428&&result.data.code==='authorization_pending'){
      try{await chrome.tabs.get(pending.tabId);}catch{await chrome.storage.session.remove(PENDING_KEY);throw new Error('确认页面已关闭，账号未连接。');}
      return {pending:true,interval:5};
    }
    if(result.status===429&&result.data.code==='slow_down')return {pending:true,interval:5};
    if(result.status!==200){await chrome.storage.session.remove(PENDING_KEY);throw new Error('授权已过期或被使用，请重新连接。');}
    const connected=await saveGrant(result.data,pending.remember,expectedEpoch);
    await chrome.storage.session.remove(PENDING_KEY);
    return connected;
  }
  chrome.runtime.onMessage.addListener((message,sender,respond)=>{
    if(!String(message?.type||'').startsWith('ACMCODER_AUTH_'))return false;
    const trusted=sender.id===chrome.runtime.id&&sender.url?.startsWith(chrome.runtime.getURL(''))&&!sender.url?.includes('/runner/');
    if(!trusted){respond({ok:false,error:'账号消息来源无效。'});return false;}
    (async()=>{
      if(message.type==='ACMCODER_AUTH_STATUS'){const value=await read();return {user:value?.user||null,remember:!!value?.remember};}
      if(message.type==='ACMCODER_AUTH_CONNECT'){
        if(connectWork)throw new Error('连接窗口已打开，请在该窗口完成确认。');
        connectWork=connect(message.remember).finally(()=>{connectWork=null;});return connectWork;
      }
      if(message.type==='ACMCODER_AUTH_POLL'){
        if(!pollWork)pollWork=poll().finally(()=>{pollWork=null;});return pollWork;
      }
      if(message.type==='ACMCODER_AUTH_LOGOUT'){
        const value=await read();if(value){try{const grant=await active();const result=await request('devices/revoke',{},grant.accessToken);if(result.status!==200&&result.status!==401)throw new Error('云端撤销暂未完成，请联网后重试。');}catch(error){if(error.code!=='401')throw error;}}
        await clear();return {ok:true};
      }
      if(message.type==='ACMCODER_AUTH_API'){
        if(!allowedPath(message.path))throw new Error('此接口不允许插件调用。');
        const value=await active();if(value.user.id!==message.accountId)return {status:409,data:{code:'account_changed',error:'账号已切换，请重新打开侧栏。'}};
        return request(message.path,message.data,value.accessToken);
      }
      throw new Error('未知账号操作。');
    })().then(result=>respond({ok:true,result}),error=>respond({ok:false,error:error.message,code:error.code}));return true;
  });
}

export function createExtensionAuth(){
  async function send(type,values={}){const reply=await chrome.runtime.sendMessage({type:`ACMCODER_AUTH_${type}`,...values});if(!reply?.ok)throw Object.assign(new Error(reply?.error||'账号连接不可用。'),{code:reply?.code});return reply.result;}
  return {status:()=>send('STATUS'),async connect(remember){
    let result=await send('CONNECT',{remember});
    // Each poll is a short worker message; no ten-minute MV3 event is held open.
    // The device secret stays in trusted session storage across worker restarts.
    while(result.pending){await new Promise(resolve=>setTimeout(resolve,result.interval*1000));result=await send('POLL');}
    return result;
  },logout:()=>send('LOGOUT'),transport:accountId=>{
    async function call(path,data){const response=await send('API',{path,data,accountId});if(response.status!==200){const error=new Error(response.data.error||'同步暂不可用');error.code=response.data.code||String(response.status);throw error;}return response.data;}
    return {async migrate(){let cursor=null;do{({nextCursor:cursor}=await call('records/migrate',{protocolVersion:1,cursor}));}while(cursor);},push:mutations=>call('sync/push',{protocolVersion:1,mutations}),pull:cursor=>call(`sync/pull?cursor=${cursor}&limit=50`)};
  }};
}
