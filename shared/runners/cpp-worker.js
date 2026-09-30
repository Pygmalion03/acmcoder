// Appended to a fixed, checksum-pinned classic compiler bundle by build-clients.
// This worker lives in a connect-src 'none', opaque-origin sandbox. It receives
// public runtime bytes and user code/stdin only; no credentials or expected output.
let taskId,phase='loading',count=0,limited=false,diagnostics='';
const decoders={};
const send=(kind,extra={})=>postMessage({kind,id:taskId,...extra});
function output(kind,text){text=String(text);const room=32768-count;if(text.length>room)limited=true;const part=text.slice(0,Math.max(0,room));count+=part.length;if(part)send(kind,{text:part});}
function stage(value,text){phase=value;send(value==='executing'?'running':'compiling',{text});}
function flushOutput(){for(const [fd,decoder]of Object.entries(decoders))output(fd==='1'?'stdout':'stderr',decoder.decode());}
onmessage=async({data})=>{
  taskId=data.id;
  try{
    const files=new Map(data.resources.map(file=>[file.name,file.bytes]));
    const readBuffer=async name=>{if(!files.has(name))throw new Error('运行资源未完整安装。');return files.get(name);};
    const log=text=>{if(phase!=='executing')diagnostics=(diagnostics+text).slice(-32768);};
    const api=new API({readBuffer,compileStreaming:async name=>WebAssembly.compile(await readBuffer(name)),hostWrite:log,showTiming:false,
      clang:'clang22',lld:'lld22',sysroot:'sysroot22-standard.tar',memfs:'memfs',clangResourceInclude:'/lib/clang/22/include',
      clangExtraArgs:['-internal-isystem','/include/wasm32-wasip1/noeh/c++/v1','-internal-isystem','/include/wasm32-wasip1','-std=c++17'],
      lldLibdir:'lib/wasm32-wasip1',lldFlags:['--export-dynamic','--max-memory=67108864'],lldLibs:['-lc','-lc++','-lc++abi','-lclang_rt.builtins']});
    await api.ready;
    const fs=api.memfs;
    const input=new TextEncoder().encode(data.stdin);let position=0;
    fs.host_read=function(fd,iovs,n,nread){if(fd!==0)return 8;this.hostMem_.check();let size=0;
      for(let i=0;i<n;i++,iovs+=8){const destination=this.hostMem_.read32(iovs),length=this.hostMem_.read32(iovs+4),available=Math.min(length,input.length-position);this.hostMem_.write(destination,input.subarray(position,position+available));position+=available;size+=available;if(available<length)break;}
      this.hostMem_.write32(nread,size);return 0;
    };
    fs.host_write=function(fd,iovs,n,nwritten){if(fd!==1&&fd!==2)return 8;this.hostMem_.check();let size=0;
      const decoder=decoders[fd]??=new TextDecoder();
      for(let i=0;i<n;i++,iovs+=8){const source=this.hostMem_.read32(iovs),length=this.hostMem_.read32(iovs+4);const text=decoder.decode(this.hostMem_.u8.subarray(source,source+length),{stream:true});if(phase==='executing')output(fd===1?'stdout':'stderr',text);else log(text);size+=length;}
      this.hostMem_.write32(nwritten,size);return 0;
    };
    stage('compiling','正在编译 C++17…');await api.compile({input:'main.cc',contents:data.code,obj:'main.o'});
    stage('linking','正在链接 C++…');await api.link('main.o','main.wasm');
    const program=await WebAssembly.compile(fs.getFileContents('main.wasm'));
    // All compilation diagnostics remain separate from stdout, including warnings.
    const warnings=diagnostics.replace(/\x1b\[[0-9;]*m/g,'').split('\n').filter(line=>!line.startsWith('> ')&&!line.includes('... done.')).join('\n').trim();
    if(warnings)output('stderr',warnings+'\n');
    for(const key of Object.keys(decoders))delete decoders[key];
    stage('executing','正在运行 C++…');
    await api.run(program,'main.wasm');
    flushOutput();
    send('complete',{outputLimited:limited});
  }catch(error){
    if(phase==='executing')flushOutput();
    const detail=phase==='executing'?String(error.message||error):diagnostics.replace(/\x1b\[[0-9;]*m/g,'').split('\n').filter(line=>!line.startsWith('> ')&&!line.includes('... done.')).join('\n').trim();
    send('error',{text:(detail||String(error.message||error)).slice(-32768),phase,outputLimited:limited});
  }
};
