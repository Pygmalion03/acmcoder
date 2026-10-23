import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {setTimeout as delay} from 'node:timers/promises';

// Use the isolated preview. These requests do not save practice records.
const origin=process.env.ACMCODER_SMOKE_URL||'http://127.0.0.1:43118';
const {token}=await fetch(`${origin}/api/session`).then(response=>response.json());
const headers={'content-type':'application/json','x-acmcoder-token':token};
const containers=()=>new Set(execFileSync('docker',['ps','-aq','--filter','name=acmcoder-run-'],{encoding:'utf8'}).trim().split('\n').filter(Boolean));
const before=containers();
const programs={
  python:{ok:'print(42)',error:'raise RuntimeError("lifecycle smoke")',loop:'while True: pass',output:'import sys\nsys.stdout.write("x" * 100000)',compile:null},
  cpp:{ok:'#include <iostream>\nint main(){std::cout << 42 << "\\n";}',error:'int main(){return 7;}',loop:'int main(){while(true){}}',output:'#include <iostream>\nint main(){for(int i=0;i<100000;i++)std::cout << "x";}',compile:'int main( {'},
  java:{ok:'public class Main {public static void main(String[] args){System.out.println(42);}}',error:'public class Main {public static void main(String[] args){throw new RuntimeException("lifecycle smoke");}}',loop:'public class Main {public static void main(String[] args){while(true){}}}',output:'public class Main {public static void main(String[] args){for(int i=0;i<100000;i++)System.out.print("x");}}',compile:'public class Main {'},
};
async function run({language,runner,code,timeoutMs=10000,id=crypto.randomUUID()}){
  const response=await fetch(`${origin}/api/run`,{method:'POST',headers,body:JSON.stringify({language,runner,code,stdin:'',expected:'',timeoutMs,id})});
  assert.equal(response.status,200);
  return (await response.json()).result;
}
function noLeakedContainers(){
  const leaked=[...containers()].filter(id=>!before.has(id));
  assert.deepEqual(leaked,[],'a lifecycle smoke container was not removed');
}
for(const runner of ['local','docker']){
  for(const [language,code] of Object.entries(programs)){
    const input={runner,language};
    const ok=await run({...input,code:code.ok});
    assert.equal(ok.status,'UNKNOWN',`${runner}/${language} normal: ${ok.status}`);
    assert.equal(ok.stdout.trim(),'42');
    const error=await run({...input,code:code.error});
    assert.equal(error.status,'RE',`${runner}/${language} runtime error`);
    if(code.compile)assert.equal((await run({...input,code:code.compile})).status,'CE');
    const timeout=await run({...input,code:code.loop,timeoutMs:5000});
    assert.equal(timeout.status,'TLE');
    assert.equal(timeout.message,'Execution timed out.','the loop must reach execution before timing out');
    noLeakedContainers();
    const id=crypto.randomUUID(),pending=run({...input,code:code.loop,timeoutMs:30000,id});
    await delay(1500);
    const stopped=await fetch(`${origin}/api/run/cancel`,{method:'POST',headers,body:JSON.stringify({id})});
    assert.equal(stopped.status,200);
    assert.equal((await pending).status,'CANCELLED');
    noLeakedContainers();
    const output=await run({...input,code:code.output});
    assert.equal(output.status,'OLE',`${runner}/${language} output limit`);
    assert.ok(Buffer.byteLength(output.stdout)+Buffer.byteLength(output.stderr)<=32768);
    noLeakedContainers();
    assert.equal((await run({...input,code:code.ok,id})).stdout.trim(),'42');
    console.log(`${runner}/${language}: normal, errors, timeout, cancel, output limit and recovery passed`);
  }
}
noLeakedContainers();
console.log('Runner lifecycle smoke passed; no new containers remain.');
