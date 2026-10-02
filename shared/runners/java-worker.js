// Bundled after BrowserFS, Doppio and the allocation guard. Only public runtime
// bytes, program source and stdin reach this opaque worker.
let currentId,outputCount=0,outputLimited=false;
const output=(kind,text)=>{text=String(text);const room=32768-outputCount;if(room<=0){outputLimited=true;return;}const part=text.slice(0,room);outputCount+=part.length;if(part.length<text.length)outputLimited=true;postMessage({kind,id:currentId,text:part});};
const quota=installJavaAllocationQuota(self.DoppioJVM||self.Doppio,{onExceeded(){postMessage({kind:'error',id:currentId,text:`Java 累计分配超过 ${quota.usage().limit/(1024*1024)} MB，已停止。`});self.close();}});
onerror=event=>{postMessage({kind:'error',id:currentId,text:event.message||'Java 启动失败。'});self.close();};
onmessage=async({data})=>{
  currentId=data.id;
  try{
    const root=new BrowserFS.FileSystem.InMemory();BrowserFS.initialize(root);
    const fs=BrowserFS.BFSRequire('fs');
    fs.mkdirSync('/sys');fs.mkdirSync('/tmp');
    for(const resource of data.resources){
      if(!/^vendor\/java_home\/[A-Za-z0-9_./-]+$/.test(resource.name)||resource.name.split('/').includes('..')||!(resource.bytes instanceof ArrayBuffer))throw new Error('Java 资源路径无效。');
      const path='/sys/'+resource.name,parts=path.split('/');
      for(let i=2;i<parts.length;i++){const directory=parts.slice(0,i).join('/');if(!fs.existsSync(directory))fs.mkdirSync(directory);}
      fs.writeFileSync(path,Buffer.from(resource.bytes));
    }
    quota.protectFiles(fs);
    process.stdout.on('data',bytes=>output('stdout',bytes.toString()));process.stderr.on('data',bytes=>output('stderr',bytes.toString()));
    const JVM=(self.DoppioJVM||self.Doppio).VM.JVM;
    const create=classpath=>new Promise((resolve,reject)=>new JVM({doppioHomePath:'/sys',classpath,intMode:true,responsiveness:1000,properties:{'file.encoding':'UTF-8'}},(error,jvm)=>{if(error)reject(error);else{quota.protect(jvm);resolve(jvm);}}));
    const run=(jvm,name,args)=>new Promise(resolve=>jvm.runClass(name,args,resolve));
    fs.mkdirSync('/tmp/run');fs.writeFileSync('/tmp/run/Main.java',data.code,'utf8');
    quota.begin(256*1024*1024);postMessage({kind:'compiling',id:currentId});
    const compiler=await create(['/sys/vendor/java_home/lib/tools.jar','/tmp/run']);
    const exit=await run(compiler,'com.sun.tools.javac.Main',['-encoding','UTF-8','-d','/tmp/run','/tmp/run/Main.java']);
    if(exit!==0){postMessage({kind:'error',id:currentId,text:'Java 编译失败，请检查上面的编译信息。'});return;}
    quota.begin(64*1024*1024);
    const jvm=await create(['/tmp/run']);
    let input=Buffer.from(data.stdin,'utf8');
    process.stdin.read=size=>{const count=Math.min(size||input.length,input.length),part=input.slice(0,count);input=input.slice(count);return part;};
    postMessage({kind:'running',id:currentId});
    const exitCode=await run(jvm,'Main',[]);
    if(exitCode!==0)postMessage({kind:'error',id:currentId,text:'Java 程序退出异常，请查看错误信息。'});
    else postMessage({kind:'complete',id:currentId,outputLimited});
  }catch(error){postMessage({kind:'error',id:currentId,text:String(error.message||error)});}
};
