const key='acmcoder-offline-account';
// This is only a pointer to an existing local copy, never an authentication token.
export function resolveWebsiteAccount({session,unreachable=false,storage=localStorage,handoff=false}){
  if(handoff)return null;
  if(session){
    const user=session.authenticated?session.user:null;
    if(user&&typeof user.id==='string'&&typeof user.login==='string')storage.setItem(key,JSON.stringify({id:user.id,login:user.login}));
    else storage.removeItem(key);
    return user;
  }
  if(!unreachable)return null;
  try{const user=JSON.parse(storage.getItem(key));return user&&typeof user.id==='string'&&typeof user.login==='string'?user:null;}catch{return null;}
}
export function forgetWebsiteAccount(storage=localStorage){storage.removeItem(key);}
