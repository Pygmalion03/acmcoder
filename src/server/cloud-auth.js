import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
const origins=new Set(['https://acmcoder-unified-preview.pages.dev','https://acmcoder.pygmalion.top']);
// Credentials live outside the learning-data directory and all learning backups.
export function createCloudAuth({origin='https://acmcoder-unified-preview.pages.dev',credentialDir=path.join(os.homedir(),'.local/share/acmcoder/credentials'),fetch:request=globalThis.fetch,clock=()=>Date.now()}={}){
  if(!origins.has(origin))throw new Error('INVALID_CLOUD_ORIGIN');
  const file=path.join(credentialDir,`${new URL(origin).hostname}.json`);
  let pending=null,refreshWork=null,epoch=0,credentialWork=Promise.resolve();
  function serialize(work){const result=credentialWork.then(work);credentialWork=result.catch(()=>{});return result;}
  function clear(){epoch++;return serialize(()=>fs.rm(file,{force:true}));}
  async function call(api,data,token){const response=await request(`${origin}/api/${api}`,{method:data?'POST':'GET',signal:AbortSignal.timeout(20000),headers:{...(data?{'content-type':'application/json'}:{}),...(token?{authorization:`Bearer ${token}`}:{})},...(data?{body:JSON.stringify(data)}:{})});const result=await response.json();if(!response.ok){const error=new Error(result.error||'连接暂不可用');error.code=result.code||String(response.status);throw error;}return result;}
  async function read(){await credentialWork;try{return JSON.parse(await fs.readFile(file,'utf8'));}catch(error){if(error.code==='ENOENT')return null;throw error;}}
  function write(value,expectedEpoch){return serialize(async()=>{
    if(expectedEpoch!==epoch)throw new Error('AUTH_CANCELLED');
    await fs.mkdir(credentialDir,{recursive:true,mode:0o700});
    const temporary=`${file}.${crypto.randomUUID()}.tmp`;
    try{await fs.writeFile(temporary,JSON.stringify(value),{mode:0o600,flag:'wx'});if(expectedEpoch!==epoch)throw new Error('AUTH_CANCELLED');await fs.rename(temporary,file);await fs.chmod(file,0o600);}
    finally{await fs.rm(temporary,{force:true});}
  });}
  async function active(){
    const saved=await read();if(!saved){const error=new Error('请连接云端账号');error.code='401';throw error;}
    if(saved.expiresAt>clock()+10000)return saved;
    if(!refreshWork){const expectedEpoch=epoch;refreshWork=(async()=>{try{const result=await call('devices/refresh',{refreshToken:saved.refreshToken});const next={...saved,...result,expiresAt:clock()+result.expiresIn*1000};await write(next,expectedEpoch);return next;}catch(error){if(['invalid_grant','refresh_reused'].includes(error.code)){await clear();error.code='401';}throw error;}})().finally(()=>refreshWork=null);}
    return refreshWork;
  }
  return {
    async start(name='ACMCoder 本地版'){const result=await call('devices/start',{name,mode:'device'});pending={...result,expiresAt:clock()+result.expiresIn*1000,nextPollAt:0,epoch:++epoch};return {userCode:result.userCode,verificationUrl:result.verificationUrl,expiresIn:result.expiresIn,interval:result.interval};},
    async poll(){
      if(!pending||pending.expiresAt<=clock()){pending=null;return {state:'expired'};}
      if(pending.nextPollAt>clock())return {state:'pending'};
      const current=pending;current.nextPollAt=clock()+5000;
      try{const result=await call('devices/token',{deviceCode:current.deviceCode});await write({...result,expiresAt:clock()+result.expiresIn*1000},current.epoch);pending=null;return {state:'connected',user:result.user};}
      catch(error){if(['authorization_pending','slow_down'].includes(error.code))return {state:'pending'};throw error;}
    },
    cancel(){epoch++;pending=null;},
    async status(){const saved=await read();return {user:saved?.user||null,deviceId:saved?.deviceId||null};},
    async disconnect(){const saved=await active();await call('devices/revoke',{},saved.accessToken);pending=null;await clear();},
    async fetch(api,data,accountId){if(!/^(records\/migrate|sync\/push|sync\/pull\?cursor=\d+&limit=50)$/.test(api))throw new Error('INVALID_SYNC_PATH');const value=await active();if(value.user.id!==accountId){const error=new Error('账号已切换');error.code='account_changed';throw error;}return call(api,data,value.accessToken);}
  };
}
