export function startOfflineSupport(){
  let label='正在准备离线页面和运行资源…',panel;
  const show=text=>{label=text;if(panel)panel.querySelector('p').textContent=text;};
  if(!('serviceWorker' in navigator))show('此浏览器不支持离线打开；练习数据仍保存在本机。');
  else navigator.serviceWorker.register('/offline-worker.js',{scope:'/'}).then(registration=>{
    function update(){
      if(registration.waiting)show('新版本已下载。关闭本站所有标签页后再打开，即可使用新版本。');
      else if(registration.active)show('离线资源已就绪。断网后可重新打开本站，继续 Python / C++ / Java 8 练习；联网后恢复同步。');
      else show('正在准备离线页面和运行资源…');
    }
    const watch=worker=>worker?.addEventListener('statechange',()=>{if(worker.state==='redundant'&&!registration.active)show('离线资源下载未完成。联网后重新打开本站可再次准备。');else update();});
    registration.addEventListener('updatefound',()=>watch(registration.installing));watch(registration.installing);update();
  }).catch(()=>show('离线资源准备未完成。请检查网络及浏览器存储空间后重新打开本站。'));
  return {mount(element){panel=element;panel.innerHTML='<h3>网站离线</h3><p class="muted"></p>';show(label);}};
}
