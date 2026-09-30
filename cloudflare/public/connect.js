const $=id=>document.getElementById(id),code=new URLSearchParams(location.search).get('code');
async function call(path,data){const response=await fetch(`/api/${path}`,{method:data?'POST':'GET',headers:data?{'content-type':'application/json'}:{},...(data?{body:JSON.stringify(data)}:{})});const result=await response.json();if(!response.ok)throw new Error(result.code==='expired_token'?'连接请求已过期，请在设备上重新发起。':result.error||'连接失败');return result;}
async function main(){
  if(!/^[A-F0-9]{10}$/.test(code||''))throw new Error('连接地址无效，请从插件或本地版发起连接。');
  const session=await call('auth/session');
  if(!session.authenticated){
    $('details').textContent='先登录，再确认要连接的设备。';
    if(session.loginAvailable){$('login').hidden=false;$('login').onclick=()=>sessionStorage.setItem('acmcoder-device-return',location.pathname+location.search);}
    else $('status').textContent='此站点的 GitHub 登录尚未配置，请保留本机练习，配置完成后重新连接。';
    return;
  }
  const request=await call(`devices/request?code=${code}`);
  $('details').textContent=`设备：${request.name} · 校验码：${code.slice(0,5)} ${code.slice(5)}`;
  $('account').textContent=`将连接到 GitHub 账号：${session.user.login}`;
  if(request.approved){$('status').textContent='这次请求已确认，请回到设备查看连接状态。';return;}
  $('approve').hidden=false;
  $('approve').onclick=async()=>{
    $('approve').disabled=true;
    try{const result=await call('devices/approve',{userCode:code});$('status').textContent='已确认连接，请回到设备继续练习。';if(result.redirectUrl)location.replace(result.redirectUrl);}
    catch(error){$('status').textContent=error.message;$('approve').disabled=false;}
  };
}
main().catch(error=>{$('details').textContent=error.message;});
