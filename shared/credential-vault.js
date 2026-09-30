const NAME='acmcoder-ai-vault-v1';
const encode=new TextEncoder(),decode=new TextDecoder();
const b64=bytes=>btoa(String.fromCharCode(...bytes));
const unb64=text=>Uint8Array.from(atob(text),c=>c.charCodeAt(0));
export function createCredentialVault({storage=globalThis.localStorage,name=NAME,crypto=globalThis.crypto}={}){
 let current=null;
 async function derive(password,salt,iterations){
  const material=await crypto.subtle.importKey('raw',encode.encode(password),'PBKDF2',false,['deriveKey']);
  return crypto.subtle.deriveKey({name:'PBKDF2',hash:'SHA-256',salt,iterations},material,{name:'AES-GCM',length:256},false,['encrypt','decrypt']);
 }
 return {
  get:id=>current?.id===id?current.key:null,
  status:()=>current?'ready':storage?.getItem(name)?'locked':'empty',
  async set(id,key,{remember=false,password=''}={}){
   if(typeof key!=='string'||!key.trim()||key.length>4096)throw new Error('请填写有效密钥。');
   const next={id,key:key.trim()};
   if(remember){
    if(!storage||password.length<8)throw new Error('记住密钥需要至少 8 位解锁口令。');
    const salt=crypto.getRandomValues(new Uint8Array(16)),iv=crypto.getRandomValues(new Uint8Array(12)),iterations=600000;
    const derived=await derive(password,salt,iterations);
    const encrypted=await crypto.subtle.encrypt({name:'AES-GCM',iv},derived,encode.encode(JSON.stringify(next)));
    storage.setItem(name,JSON.stringify({version:1,iterations,salt:b64(salt),iv:b64(iv),ciphertext:b64(new Uint8Array(encrypted))}));
   }else storage?.removeItem(name);
   current=next;
  },
  clear(){current=null;storage?.removeItem(name);},lock(){current=null;},
  async unlock(password){
   try{
    const box=JSON.parse(storage?.getItem(name));
    if(box.version!==1||box.iterations!==600000)throw new Error();
    const derived=await derive(password,unb64(box.salt),box.iterations);
    const plain=await crypto.subtle.decrypt({name:'AES-GCM',iv:unb64(box.iv)},derived,unb64(box.ciphertext));
    const next=JSON.parse(decode.decode(plain));if(typeof next.id!=='string'||typeof next.key!=='string')throw new Error();current=next;
   }catch{throw new Error('解锁失败，请核对口令。');}
  }
 };
}
