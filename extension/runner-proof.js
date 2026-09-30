import {createExtensionRunner} from './runner.js';
const result=document.getElementById('result');
let runner,id;
try{runner=await createExtensionRunner({frame:document.getElementById('sandbox')});result.textContent='ready';}catch(e){result.textContent=e.message;}
document.getElementById('run').onclick=async()=>{result.textContent='';id=crypto.randomUUID();await runner.run({id,language:'python',code:document.getElementById('code').value,stdin:document.getElementById('stdin').value},e=>{result.textContent+=JSON.stringify(e)+'\n';});};
document.getElementById('stop').onclick=()=>runner?.cancel(id);
