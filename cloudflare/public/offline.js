export function startOfflineSupport(){
  let label='正在准备离线页面和运行资源…',panel;
  const show=text=>{label=text;if(panel)panel.querySelector('p').textContent=text;};
  let javaReady;
  async function prepareJavaBootstrap(){
    const response=await fetch('/vendor/java/manifest.json',{credentials:'omit'});
    if(!response.ok)throw new Error('Java bootstrap manifest unavailable');
    const {bridge}=await response.json();if(!/^bridge-[a-f0-9]{24}\.html$/.test(bridge))throw new Error('Invalid Java bootstrap');
    // Opaque frames use the HTTP cache rather than the Service Worker cache.
    // Actually navigate one now, before claiming that first offline run works.
    await new Promise((resolve,reject)=>{
      const frame=document.createElement('iframe'),nonce=crypto.randomUUID();frame.hidden=true;frame.title='准备离线 Java';frame.setAttribute('sandbox','allow-scripts');
      const finish=error=>{clearTimeout(timer);removeEventListener('message',receive);frame.remove();error?reject(error):resolve();};
      const receive=event=>{if(event.source===frame.contentWindow&&event.origin==='null'&&event.data?.nonce===nonce&&event.data.kind==='ready')finish();};
      const timer=setTimeout(()=>finish(new Error('Java bootstrap unavailable')),10000);addEventListener('message',receive);
      frame.src=`/vendor/java/${bridge}#${nonce}`;document.body.append(frame);
    });
  }
  if(!('serviceWorker' in navigator))show('此浏览器不支持离线打开；练习数据仍保存在本机。');
  else navigator.serviceWorker.register('/offline-worker.js',{scope:'/'}).then(registration=>{
    function update(){
      if(registration.waiting)show('新版本已下载。关闭本站所有标签页后再打开，即可使用新版本。');
      else if(registration.installing)show('正在下载当前版本的离线页面和运行资源…');
      else if(registration.active){
        show('正在确认 Java 离线启动…');
        javaReady??=prepareJavaBootstrap();
        javaReady.then(()=>{if(!registration.waiting)show('离线资源已就绪。断网后可重新打开本站，继续 Python / C++ / Java 8 练习；联网后恢复同步。');},()=>{if(!registration.waiting)show('Python / C++ 离线资源已就绪；Java 启动页未准备完成，请联网后重新打开本站。');});
      }
      else show('正在准备离线页面和运行资源…');
    }
    const watch=worker=>worker?.addEventListener('statechange',()=>{if(worker.state==='redundant'&&!registration.active)show('离线资源下载未完成。联网后重新打开本站可再次准备。');else update();});
    registration.addEventListener('updatefound',()=>watch(registration.installing));watch(registration.installing);update();
  }).catch(()=>show('离线资源准备未完成。请检查网络及浏览器存储空间后重新打开本站。'));
  return {mount(element){panel=element;panel.innerHTML='<h3>网站离线</h3><p class="muted"></p>';show(label);}};
}
