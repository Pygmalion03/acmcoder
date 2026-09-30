// All bearer secrets are random and stored only as SHA-256 digests.
export class DeviceAuthError extends Error {
  constructor(code,status=400){super(code);this.code=code;this.status=status;}
}
const fail=(code,status)=>{throw new DeviceAuthError(code,status);};
export const digest=async value=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))),b=>b.toString(16).padStart(2,'0')).join('');
const secret=()=>Array.from(crypto.getRandomValues(new Uint8Array(32)),b=>b.toString(16).padStart(2,'0')).join('');
const validSecret=value=>typeof value==='string'&&/^[0-9a-f]{64}$/.test(value);
export async function pkceChallenge(verifier){return btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(verifier))))).replaceAll('+','-').replaceAll('/','_').replaceAll('=','');}

export function createDeviceAuth(db,{origin,extensionIds=[],clock=()=>Math.floor(Date.now()/1000)}={}){
  const fields='id,login,avatar_url';
  async function start(data,ip='unknown'){
    if(!data||typeof data.name!=='string'||!data.name.trim()||data.name.length>80)fail('invalid_device_name');
    const mode=data.mode||'device';
    if(!['device','pkce'].includes(mode))fail('invalid_client');
    if(mode==='pkce'){
      if(data.codeChallengeMethod!=='S256'||!/^[-_a-zA-Z0-9]{43}$/.test(data.codeChallenge||'')||!/^[-_a-zA-Z0-9]{32,128}$/.test(data.state||''))fail('invalid_pkce');
      if(!extensionIds.some(id=>/^[a-p]{32}$/.test(id)&&data.redirectUri===`https://${id}.chromiumapp.org/connect`))fail('unregistered_extension',403);
    }
    const time=clock(),bucket=await digest(`${ip}:${Math.floor(time/3600)}`);
    const result=await db.batch([
      db.prepare('DELETE FROM device_start_limits WHERE expires_at<=?').bind(time),
      db.prepare('DELETE FROM device_requests WHERE expires_at<=?').bind(time),
      db.prepare('INSERT INTO device_start_limits(bucket,count,expires_at) VALUES (?,1,?) ON CONFLICT(bucket) DO UPDATE SET count=count+1 WHERE count<10').bind(bucket,time+3600)
    ]);
    if(!result[2].meta.changes)fail('slow_down',429);
    const total=await db.prepare('SELECT COUNT(*) AS n FROM device_requests').bind().first();
    if(total.n>=1000)fail('temporarily_unavailable',503);
    const deviceCode=secret(),userCode=Array.from(crypto.getRandomValues(new Uint8Array(5)),b=>b.toString(16).padStart(2,'0')).join('').toUpperCase();
    await db.prepare('INSERT INTO device_requests(id,code_hash,user_code,name,mode,challenge,redirect_uri,state,expires_at) VALUES (?,?,?,?,?,?,?,?,?)')
      .bind(crypto.randomUUID(),await digest(deviceCode),userCode,data.name.trim(),mode,mode==='pkce'?data.codeChallenge:null,mode==='pkce'?data.redirectUri:null,mode==='pkce'?data.state:null,time+600).run();
    return {deviceCode,userCode,verificationUrl:`${origin}/connect.html?code=${userCode}`,expiresIn:600,interval:5};
  }
  async function info(userCode){
    if(!/^[A-F0-9]{10}$/.test(userCode||''))fail('invalid_request');
    const row=await db.prepare('SELECT name,mode,expires_at,approved_at,consumed_at FROM device_requests WHERE user_code=? AND expires_at>?').bind(userCode,clock()).first();
    if(!row||row.consumed_at)fail('expired_token',410);
    return {name:row.name,mode:row.mode,approved:!!row.approved_at,expiresAt:row.expires_at};
  }
  async function approve(userCode,userId){
    await info(userCode);
    const time=clock(),code=secret();
    await db.prepare('DELETE FROM device_grants WHERE expires_at<=?').bind(time).run();
    const count=await db.prepare('SELECT COUNT(*) AS n FROM device_grants WHERE user_id=? AND revoked_at IS NULL').bind(userId).first();
    if(count.n>=10)fail('device_limit',429);
    const result=await db.prepare('UPDATE device_requests SET user_id=?,approved_at=?,code_hash=CASE WHEN mode=\'pkce\' THEN ? ELSE code_hash END WHERE user_code=? AND approved_at IS NULL AND expires_at>? AND consumed_at IS NULL')
      .bind(userId,time,await digest(code),userCode,time).run();
    if(!result.meta.changes)fail('already_approved',409);
    const row=await db.prepare('SELECT mode,redirect_uri,state FROM device_requests WHERE user_code=?').bind(userCode).first();
    if(row.mode==='pkce'){const url=new URL(row.redirect_uri);url.searchParams.set('code',code);url.searchParams.set('state',row.state);return {approved:true,redirectUrl:url.href};}
    return {approved:true};
  }
  async function token(data){
    if(!validSecret(data?.deviceCode))fail('invalid_grant',401);
    const time=clock(),row=await db.prepare('SELECT * FROM device_requests WHERE code_hash=?').bind(await digest(data.deviceCode)).first();
    if(!row||row.consumed_at)fail('invalid_grant',401);
    if(row.expires_at<=time)fail('expired_token',410);
    if(row.mode==='pkce'){
      if(!/^[-._~a-zA-Z0-9]{43,128}$/.test(data.codeVerifier||'')||await pkceChallenge(data.codeVerifier)!==row.challenge)fail('invalid_pkce',401);
    }else{
      const polled=await db.prepare('UPDATE device_requests SET poll_at=? WHERE id=? AND (poll_at=0 OR poll_at<=?)').bind(time,row.id,time-5).run();
      if(!polled.meta.changes)fail('slow_down',429);
    }
    if(!row.user_id)fail('authorization_pending',428);
    const accessToken=secret(),refreshToken=secret(),grantId=crypto.randomUUID(),claim=secret();
    const accessHash=await digest(accessToken),refreshHash=await digest(refreshToken);
    const result=await db.batch([
      db.prepare('UPDATE device_requests SET consumed_at=?,claim=? WHERE id=? AND consumed_at IS NULL AND expires_at>?').bind(time,claim,row.id,time),
      db.prepare('INSERT INTO device_grants(id,user_id,name,access_hash,access_expires,refresh_hash,expires_at,created_at,last_used_at) SELECT ?,user_id,name,?,?,?,?,?,? FROM device_requests WHERE id=? AND claim=?').bind(grantId,accessHash,time+900,refreshHash,time+30*86400,time,time,row.id,claim),
      db.prepare('INSERT INTO device_refresh_tokens(token_hash,grant_id) SELECT refresh_hash,id FROM device_grants WHERE id=?').bind(grantId)
    ]);
    if(!result[0].meta.changes)fail('invalid_grant',401);
    const user=await db.prepare(`SELECT ${fields} FROM users WHERE id=?`).bind(row.user_id).first();
    return {accessToken,refreshToken,expiresIn:900,refreshExpiresAt:time+30*86400,deviceId:grantId,user:{id:user.id,login:user.login,avatarUrl:user.avatar_url}};
  }
  async function refresh(data){
    if(!validSecret(data?.refreshToken))fail('invalid_grant',401);
    const hash=await digest(data.refreshToken),time=clock();
    const row=await db.prepare('SELECT g.*,t.used_at FROM device_refresh_tokens t JOIN device_grants g ON g.id=t.grant_id WHERE t.token_hash=?').bind(hash).first();
    if(!row||row.revoked_at||row.expires_at<=time)fail('invalid_grant',401);
    if(row.used_at!==null||row.refresh_hash!==hash){await revoke(row.user_id,row.id);fail('refresh_reused',401);}
    const accessToken=secret(),refreshToken=secret(),nextHash=await digest(refreshToken);
    const result=await db.batch([
      db.prepare('UPDATE device_grants SET access_hash=?,access_expires=?,refresh_hash=?,last_used_at=? WHERE id=? AND refresh_hash=? AND revoked_at IS NULL AND expires_at>?').bind(await digest(accessToken),time+900,nextHash,time,row.id,hash,time),
      db.prepare('INSERT INTO device_refresh_tokens(token_hash,grant_id) SELECT refresh_hash,id FROM device_grants WHERE id=? AND refresh_hash=?').bind(row.id,nextHash),
      db.prepare('UPDATE device_refresh_tokens SET used_at=? WHERE token_hash=? AND EXISTS(SELECT 1 FROM device_grants WHERE id=? AND refresh_hash=?)').bind(time,hash,row.id,nextHash)
    ]);
    if(!result[0].meta.changes){await revoke(row.user_id,row.id);fail('refresh_reused',401);}
    return {accessToken,refreshToken,expiresIn:900,refreshExpiresAt:row.expires_at};
  }
  async function authenticate(value){
    if(!validSecret(value))return null;
    return db.prepare('SELECT u.id,u.login,u.avatar_url,g.id AS deviceId FROM device_grants g JOIN users u ON u.id=g.user_id WHERE g.access_hash=? AND g.access_expires>? AND g.expires_at>? AND g.revoked_at IS NULL').bind(await digest(value),clock(),clock()).first();
  }
  async function list(userId){return (await db.prepare('SELECT id,name,created_at,last_used_at,expires_at FROM device_grants WHERE user_id=? AND revoked_at IS NULL AND expires_at>? ORDER BY created_at DESC').bind(userId,clock()).all()).results;}
  async function revoke(userId,id){await db.prepare('UPDATE device_grants SET revoked_at=? WHERE id=? AND user_id=? AND revoked_at IS NULL').bind(clock(),id,userId).run();return {ok:true};}
  return {start,info,approve,token,refresh,authenticate,list,revoke};
}
