const $ = (id) => document.getElementById(id);
let worker, pending, generation = 0, active = false;
let stopping = false;
let lastHeartbeat = performance.now(), maximumHeartbeatGap = 0;
const records = [];
let resourceCache;
async function isolatedWorker() {
  const names = ['isolated-worker.js', 'clang22', 'lld22', 'sysroot22-standard.tar', 'memfs'];
  resourceCache ||= Promise.all(names.map(async name => {
    const response = await fetch(`./cpp/${name}`);
    if (!response.ok) throw new Error(`Cannot load ${name}`);
    return { name, bytes: await response.arrayBuffer() };
  }));
  const resources = await resourceCache;
  const frame = document.createElement('iframe');
  frame.hidden = true; frame.sandbox = 'allow-scripts';
  const nonce = crypto.randomUUID();
  let receive;
  let firstRun = true;
  const proxy = { onmessage: null, onerror: null,
    postMessage: data => {
      frame.contentWindow.postMessage({ ...data, type: 'run', nonce, resources: firstRun ? resources : undefined, isolationCheck: true, parentUrl: location.href }, '*');
      firstRun = false;
    },
    terminate: () => { frame.contentWindow?.postMessage({ type: 'stop', nonce }, '*'); removeEventListener('message', receive); frame.remove(); },
  };
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Sandbox initialization deadline')), 5000);
    function onReady() { clearTimeout(timeout); resolve(); }
    receive = (event) => {
      if (event.source !== frame.contentWindow || event.origin !== 'null' || event.data?.nonce !== nonce) return;
      if (event.data.type === 'ready') onReady();
      else proxy.onmessage?.({ data: event.data });
    };
    addEventListener('message', receive);
    frame.src = `./isolated-bridge.html#${nonce}`; document.body.append(frame);
  });
  return proxy;
}
setInterval(() => {
  const now = performance.now();
  maximumHeartbeatGap = Math.max(maximumHeartbeatGap, now - lastHeartbeat);
  lastHeartbeat = now;
  $('heartbeat').textContent = `主线程心跳 ${Math.round(now)} ms；最大间隔 ${Math.round(maximumHeartbeatGap)} ms`;
}, 100);
function stop(reason = 'manual-cancel') {
  worker?.terminate(); worker = null;
  pending?.resolve({ cancelled: true, reason, phase: pending.phase, ms: performance.now() - pending.start });
}
async function run(code, stdin = '', options = {}) {
  if (stopping) return { cancelled: true, reason: 'manual-cancel' };
  if (!worker) {
    const language = document.querySelector('select').value;
    worker = $('isolation').checked ? await isolatedWorker() : new Worker(`./${language}/worker.js`, language === 'cpp' ? { type: 'module' } : {});
    worker.onmessage = ({ data }) => {
      if (data.type === 'phase') {
        pending.phase = data.phase;
        $('status').textContent = data.phase;
        if (data.phase === 'executing' && pending.cancelOnExecution) setTimeout(() => stop('loop-cancel'), 250);
      } else if (data.type === 'result' && data.id === pending?.id) pending.resolve(data);
    };
    worker.onerror = (event) => { pending?.resolve({ error: event.message, phase: pending.phase }); worker?.terminate(); worker = null; };
  }
  return new Promise((resolve) => {
    const id = ++generation;
    const timeout = setTimeout(() => stop('deadline'), options.deadline || 60000);
    pending = { id, phase: 'loading', start: performance.now(), cancelOnExecution: options.cancelOnExecution, resolve: (value) => { clearTimeout(timeout); pending = null; resolve(value); } };
    worker.postMessage({ id, code, stdin });
  });
}
const cppBasic = '#include <iostream>\n#include <vector>\n#include <string>\n#include <map>\n#include <algorithm>\nint main(){int n;std::cin>>n;std::vector<int> a(n);for(auto &x:a)std::cin>>x;std::sort(a.begin(),a.end());std::map<std::string,int> m; m["结果"]=a.front()+a.back();std::cout<<"结果 "<<m["结果"]<<"\\n";return 0;}';
const javaBasic = 'import java.util.*; public class Main { public static void main(String[] args){ Scanner s=new Scanner(System.in,"UTF-8");int n=s.nextInt();int[] a=new int[n];for(int i=0;i<n;i++)a[i]=s.nextInt();Arrays.sort(a);Map<String,Integer> m=new HashMap<>();m.put("结果",a[0]+a[n-1]);System.out.println("结果 "+m.get("结果"));}}';
const javaEcho = 'import java.io.*; public class Main {public static void main(String[] args)throws Exception {BufferedReader b=new BufferedReader(new InputStreamReader(System.in,"UTF-8"));String s;while((s=b.readLine())!=null)System.out.println(s);}}';
async function record(name, result, verify) {
  const value = { name, ...result, passed: Boolean(verify(result)), maximumHeartbeatGap };
  records.push(value); $('results').textContent = JSON.stringify(records, null, 2);
  return value.passed;
}
async function execute(full) {
  if (active) return;
  active = true; stopping = false; stop('reset'); records.length = 0; maximumHeartbeatGap = 0;
  const language = document.querySelector('select').value;
  const basic = language === 'cpp' ? cppBasic : javaBasic;
  try {
    const okay = await record('standard-libraries-fresh-source', await run(basic, '4\n7 2 9 3\n'), r => !r.error && r.exitCode === 0 && r.stdout.trim() === '结果 11');
    if (!okay || !full) return;
    const echo = language === 'cpp' ? '#include <iostream>\n#include <string>\nint main(){std::string s;while(std::getline(std::cin,s))std::cout<<s<<"\\n";}' : javaEcho;
    await record('unicode-multiline', await run(echo, '中文输入\n第二行🐍\n'), r => r.stdout?.trim() === '中文输入\n第二行🐍');
    await record('compile-error', await run(language === 'cpp' ? 'int main(){ invalid syntax; }' : 'public class Main { invalid syntax }'), r => Boolean(r.error) && !r.cancelled);
    const repeated = [];
    for (let i = 0; i < 20; i++) {
      const r = await run(basic, '4\n7 2 9 3\n');
      repeated.push({ ms: r.ms, passed: r.stdout?.trim() === '结果 11', error: r.error });
      $('status').textContent = `重复运行 ${i + 1}/20`;
      if (!repeated.at(-1).passed) break;
    }
    await record('20-repeats', { repeated }, r => r.repeated.length === 20 && r.repeated.every(v => v.passed));
    const count = language === 'cpp' ? '#include <iostream>\nint main(){long n=0;char c;while(std::cin.get(c))n++;std::cout<<n<<"\\n";}' : 'import java.io.*; public class Main {public static void main(String[] a)throws Exception{long n=0;while(System.in.read()!=-1)n++;System.out.println(n);}}';
    await record('1MiB-stdin', await run(count, 'a'.repeat(1024 * 1024)), r => r.stdout?.trim() === '1048576');
    const padding = '\n/*' + 'x'.repeat(128 * 1024 - new TextEncoder().encode(basic).length - 6) + '*/\n';
    await record('128KiB-source', await run(basic + padding, '4\n7 2 9 3\n'), r => r.stdout?.trim() === '结果 11');
    const memory = language === 'cpp' ? '#include <cstdlib>\n#include <cstdio>\nint main(){volatile char*p=(volatile char*)malloc(80*1024*1024);if(!p){puts("BOUNDED");return 0;}p[0]=1;p[80*1024*1024-1]=2;puts("UNBOUNDED");free((void*)p);}' : 'public class Main {public static void main(String[] a){try{byte[] b=new byte[80*1024*1024];b[0]=1;b[b.length-1]=2;System.out.println("UNBOUNDED "+b.length);}catch(OutOfMemoryError e){System.out.println("BOUNDED");}}}';
    await record('64MiB-memory-bound', await run(memory), r => r.stdout?.trim() === 'BOUNDED');
    const loop = language === 'cpp' ? 'int main(){volatile int x=0;while(true){x++;}}' : 'public class Main {public static void main(String[] a){while(true){}}}';
    await record('infinite-loop-cancel', await run(loop, '', { cancelOnExecution: true }), r => r.cancelled && r.reason === 'loop-cancel' && r.phase === 'executing');
    await record('recovery-after-cancel', await run(basic, '4\n7 2 9 3\n'), r => r.stdout?.trim() === '结果 11');
  } finally { active = false; $('status').textContent = '实验结束；隔离与分发尚需独立验收'; }
}
$('basic').onclick = () => execute(false);
async function quotaReview(){
  if(active)return;active=true;stopping=false;stop('reset');records.length=0;document.querySelector('select').value='java';
  try{
    const okay=await record('quota-standard-input-unicode-collections',await run(javaBasic,'4\n7 2 9 3\n'),r=>r.stdout?.trim()==='结果 11');if(!okay)return;
    const cases=[
      ['single-80MiB','byte[] b=new byte[80*1024*1024];System.out.println("UNBOUNDED "+b.length);'],
      ['repeated-small-arrays','java.util.List<byte[]> a=new java.util.ArrayList<>();for(int i=0;i<20;i++)a.add(new byte[4*1024*1024]);System.out.println("UNBOUNDED");'],
      ['reflection-allocation','Object a=java.lang.reflect.Array.newInstance(byte.class,80*1024*1024);System.out.println("UNBOUNDED");'],
      ['multidimensional-allocation','byte[][] a=new byte[32][4*1024*1024];System.out.println("UNBOUNDED");'],
      ['array-cloning','byte[] a=new byte[32*1024*1024];byte[] b=a.clone();System.out.println("UNBOUNDED");'],
    ];
    for(const [name,body] of cases){stop('new-memory-case');await record(name,await run(`public class Main {public static void main(String[] args){${body}}}`),r=>r.kind==='MemoryLimit'&&!r.stdout?.includes('UNBOUNDED'));}
    stop('new-interop-case');await record('javascript-interop-disabled',await run('public class Main {public static void main(String[] a){System.out.println(doppio.JavaScript.eval("1+1"));}}'),r=>r.stderr?.includes('SecurityException')&&!r.stdout?.includes('2'));
    stop('recovery');await record('recovery-after-quota',await run(javaBasic,'4\n7 2 9 3\n'),r=>r.stdout?.trim()==='结果 11');
  }finally{active=false;$('status').textContent='配额复核结束；仍是实验，尚未接入产品。';}
}
$('quota').onclick=quotaReview;
$('file-quota').onclick=async()=>{
  if(active)return;active=true;stopping=false;stop('reset');records.length=0;document.querySelector('select').value='java';
  try{
    await record('host-file-buffer-bound',await run('import java.io.*; public class Main {public static void main(String[] a)throws Exception{byte[] b=new byte[1024*1024];FileOutputStream f=new FileOutputStream("/tmp/large-file");for(int i=0;i<100;i++)f.write(b);f.close();System.out.println("UNBOUNDED");}}'),r=>r.kind==='MemoryLimit');
    stop('object-case');await record('managed-object-bound',await run('import java.util.*; public class Main {public static void main(String[] a){List<Object> x=new LinkedList<>();for(int i=0;i<500000;i++)x.add(new Object());System.out.println("UNBOUNDED");}}'),r=>r.kind==='MemoryLimit');
    stop('recovery');await record('recovery-after-host-bound',await run(javaBasic,'4\n7 2 9 3\n'),r=>r.stdout?.trim()==='结果 11');
  }finally{active=false;$('status').textContent='文件和对象配额复核结束；仍是实验。';}
};
$('suite').onclick = () => execute(true);
$('cancel').onclick = () => { stopping = true; stop(); };
$('export').onclick = () => {
  const blob = new Blob([JSON.stringify({ date: new Date().toISOString(), language: document.querySelector('select').value, userAgent: navigator.userAgent, records }, null, 2)], { type: 'application/json' });
  const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = 'browser-language-probe.json'; link.click(); URL.revokeObjectURL(link.href);
};
