import {templates} from '../practice.js';
import {normalizeProblem} from '../import.js';

const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const example={kind:'problem',id:'sum',payload:{title:'两个整数相加',statement:'读取两个整数，输出它们的和。\n\n输入：一行两个整数，以空格分隔。\n输出：两个整数的和。',sourceKind:'builtin',tags:['入门','标准输入输出'],rawSamples:['输入：3 5\n输出：8'],cases:[{stdin:'3 5\n',expected:'8\n'}],archivedAt:null}};
export async function mountWorkspace(root,{store,runner,account,catalog=[],client={},clock=()=>new Date()}) {
  let view='today',selected='sum',filter='mine',query='',draft=null,runId=null,noticeTimer=null,navigation=0;
  let problems=[],settings={theme:'light',timezone:'Asia/Shanghai',count:3},output='',errorOutput='';
  let last=await store.getMeta('location');
  const savedSettings=await store.getRecord({kind:'settings',id:'preferences'});
  if(savedSettings)settings={...settings,...savedSettings.payload};
  document.documentElement.dataset.theme=settings.theme;
  if(!await store.getMeta('initialized')){
    if(!await store.getRecord({kind:'problem',id:'sum'})&&!await store.getMeta('deleted:sum'))await store.putRecord(example);
    const old=globalThis.localStorage?.getItem('acmcoder-free-draft-v1:sum');
    let values={code:'a, b = map(int, input().split())\nprint(a + b)\n',stdin:'3 5\n',expected:'8\n'};
    try{if(old)values={...values,...JSON.parse(old)};}catch{/* retain original legacy key */}
    if(!await store.getMeta('deleted:sum')&&!await store.getDraft({problemId:'sum',language:'python'}))await store.saveDraft({problemId:'sum',language:'python',...values,mode:'normal'});
    await store.setMeta('initialized',true);
  }
  async function refresh(){problems=await store.listRecords({kind:'problem'});}
  await refresh();
  if(last&&problems.some(p=>p.id===last.problemId)){selected=last.problemId;view=last.view;}
  const $=id=>root.querySelector(`#${id}`);
  const problem=()=>problems.find(p=>p.id===selected);
  const button=(action,label,cls='',id='')=>`<button type="button" class="${cls}" data-action="${action}"${id?` data-id="${escape(id)}"`:''}>${label}</button>`;
  function toast(message){clearTimeout(noticeTimer);const el=$('notice');el.textContent=message;el.hidden=false;noticeTimer=setTimeout(()=>{el.hidden=true;},7000);}
  const day=(date=clock())=>new Intl.DateTimeFormat('en-CA',{timeZone:settings.timezone,year:'numeric',month:'2-digit',day:'2-digit'}).format(date);
  function tomorrow(){const [y,m,d]=day().split('-').map(Number);return new Date(Date.UTC(y,m-1,d+1)).toISOString().slice(0,10);}
  root.innerHTML=`<header class="glass"><div class="brand"><b>✦</b>ACMCoder</div><nav aria-label="工作区">${['today','library','practice'].map((name,i)=>button(`nav-${name}`,['☀ 今日','▤ 题库','⌘ 练习'][i])).join('')}</nav><div class="head-actions">${button('theme','◐','quiet')}${button('nav-settings','设置与数据','quiet')}</div></header><main id="content"></main><div id="notice" class="status-message" role="status" hidden></div>
    <dialog id="import-dialog"><div class="dialog-title"><h2>导入题目</h2>${button('close-import','✕','quiet')}</div><p class="muted">保留题面和原始样例，ACM 输入由你自行调整。</p><label>原题链接<input id="import-url" type="url" placeholder="https://leetcode.cn/problems/…/"></label>${button('fetch-import','读取公开题面','quiet')}<label>题目名称<input id="import-title" maxlength="160" placeholder="例如：两数之和"></label><label>题面<textarea id="import-statement" placeholder="粘贴题面，或从原题链接读取"></textarea></label><label>原始样例<textarea id="import-samples" placeholder="保留原平台样例，不自动转换函数参数"></textarea></label><p id="import-note" class="muted" role="status"></p><footer>${button('close-import','取消','quiet')}${button('save-import','导入并开始练习','primary')}</footer></dialog>
    <dialog id="delete-dialog"><h2>彻底删除这道题？</h2><p>本机的题面、草稿、重写记录与复习安排将一并删除。此操作无法撤销；需要保留时请先导出备份。</p><footer>${button('cancel-delete','取消')}${button('confirm-delete','彻底删除','danger')}</footer></dialog>`;
  async function persistLocation(){await store.setMeta('location',{view,problemId:selected});}
  async function saveEditor(){
    if(!draft||!$('code'))return;
    const current={...draft,code:$('code').value,stdin:$('stdin').value,expected:$('expected').value};
    draft=current;
    $('save-status').textContent='正在保存…';
    try{await store.saveDraft(current);if(draft===current&&$('save-status'))$('save-status').textContent='已保存到此设备';}
    catch(error){if($('save-status'))$('save-status').textContent='保存失败，请保留当前页面';throw error;}
  }
  async function navigate(next,id){
    const epoch=++navigation;
    if(view==='practice')await saveEditor();
    if(runId){runner.cancel(runId);runId=null;}
    if(epoch!==navigation)return;
    view=next;if(id)selected=id;
    await refresh();
    if(view==='practice'&&!problem()){view='library';}
    await persistLocation();await render();
  }
  async function today(){
    const active=problems.filter(p=>!p.payload.archivedAt);
    const reviews=(await store.listRecords({kind:'review'})).filter(r=>r.payload.dueDay<=day()&&!r.payload.completedAt);
    const plans=(await store.getRecord({kind:'plan',id:`plan-${day()}`}))?.payload.completed||{};
    const ordered=[...reviews.map(r=>active.find(p=>p.id===r.problemId)).filter(Boolean),...active];
    const entries=[...new Map(ordered.map(p=>[p.id,p])).values()].slice(0,settings.count);
    const recent=active.find(p=>p.id===selected)||active[0];
    return `<div class="hero"><div><div class="eyebrow">YOUR DAILY PRACTICE</div><h1 class="gradient">今天，从一题开始。</h1><p class="muted">把昨天的思路，变成今天能独立写出的代码。</p></div><div class="orb" aria-hidden="true">✦</div></div>${recent?`<section class="continue glass"><div class="continue-icon">⌘</div><div><span class="eyebrow">继续上次练习</span><h3>${escape(recent.payload.title)}</h3><span class="muted">你的代码和输入都留在这里</span></div>${button('practice','继续练习 ↗','primary',recent.id)}</section>`:''}<div class="section-heading"><div><h2>今日安排</h2><span class="muted">${day()} · 按自己的节奏来</span></div><label class="muted">题量 <select id="daily-count">${[1,2,3,4,5].map(n=>`<option ${n===settings.count?'selected':''}>${n}</option>`).join('')}</select></label></div><div class="cards">${entries.map(p=>`<article class="card glass"><span class="tag">${reviews.some(r=>r.problemId===p.id)?'到期复习':'我的题目'}</span><h3>${escape(p.payload.title)}</h3><p class="muted">${escape(p.payload.tags?.join(' · ')||'完整程序 · ACM 输入输出')}</p><div class="card-footer">${button('complete-plan',plans[p.id]?'✓ 已完成':'标记完成','quiet',p.id)}${button('practice','开始 →','',p.id)}</div></article>`).join('')||'<div class="empty">去题库导入第一道题，开始今天的练习。</div>'}</div><div class="section-heading"><span class="muted">复习安排可随时调整，不影响历史记录。</span>${button('nav-library','去题库找题 →','quiet')}</div>`;
  }
  function library(){
    if(filter==='recommend')return `<div class="hero"><div><div class="eyebrow">DISCOVER YOUR NEXT CHALLENGE</div><h1 class="gradient">下一题，从这里开始。</h1><p class="muted">来自已有高频题目录，导入时读取真实题面。</p></div>${button('open-import','＋ 导入题目','primary')}</div><div class="toolbar"><div class="tabs">${button('filter-mine','我的题库')}<button data-action="filter-recommend" aria-pressed="true">推荐题目</button>${button('filter-archive','已归档')}</div><input id="search" class="search" placeholder="搜索题目或标签" aria-label="搜索题目" value="${escape(query)}"></div><div class="rows glass">${catalog.filter(p=>(p.title+' '+p.tags.join(' ')).includes(query)).map(p=>`<article class="row"><div class="row-title"><h3>${escape(p.title)}</h3><div class="muted">${escape(p.tags.join(' · '))}</div></div><span class="tag">${{easy:'简单',medium:'中等',hard:'困难'}[p.difficulty]||''}</span>${button('recommend-import','导入练习 →','',p.leetcodeSlug)}</article>`).join('')||'<div class="empty">没有匹配的推荐题。</div>'}</div>`;
    const items=problems.filter(p=>filter==='archive'?!!p.payload.archivedAt:!p.payload.archivedAt).filter(p=>(p.payload.title+' '+p.payload.tags?.join(' ')).toLowerCase().includes(query.toLowerCase()));
    return `<div class="hero"><div><div class="eyebrow">YOUR PROBLEM LIBRARY</div><h1 class="gradient">让每一道题，都有下文。</h1><p class="muted">收集、练习、重写。你的积累都留在这里。</p></div>${button('open-import','＋ 导入题目','primary')}</div><div class="toolbar"><div class="tabs"><button data-action="filter-mine" aria-pressed="${filter==='mine'}">我的题库</button><button data-action="filter-recommend" aria-pressed="false">推荐题目</button><button data-action="filter-archive" aria-pressed="${filter==='archive'}">已归档</button></div><input id="search" class="search" placeholder="搜索题目或标签" aria-label="搜索题目" value="${escape(query)}"></div><div class="rows glass">${items.map(p=>`<article class="row"><div class="row-title"><h3>${escape(p.payload.title)}</h3><div class="muted">${escape(p.payload.tags?.join(' · ')||'ACM 完整程序练习')}</div></div><span class="tag">${p.payload.sourceKind==='builtin'?'内置示例':p.payload.sourceUrl?'外部来源':'手动导入'}</span><div class="row-actions">${filter==='archive'?button('restore','恢复','',p.id)+button('delete','彻底删除','danger',p.id):button('practice','练习 →','',p.id)+button('archive','归档','quiet',p.id)}</div></article>`).join('')||'<div class="empty">这里还没有题目。</div>'}</div>`;
  }
  async function practice(){
    const p=problem();
    draft=await store.getDraft({problemId:selected,language:'python'});
    if(!draft)draft=await store.saveDraft({problemId:selected,language:'python',code:templates.python,stdin:p.payload.cases?.[0]?.stdin||'',expected:p.payload.cases?.[0]?.expected||'',mode:'normal'});
    return `<div class="practice-heading"><div><span class="eyebrow">当前练习 · ACM</span><h2>${escape(p.payload.title)}</h2></div><span id="save-status" class="save-state">已保存到此设备</span></div><div class="workspace"><section class="glass"><div class="panel-head"><strong>题目</strong><span class="tag">完整程序</span></div><div class="statement-body">${escape(p.payload.statement||'暂无题面，请参考原题链接。')}${p.payload.sourceUrl?`<a class="source-url" href="${escape(p.payload.sourceUrl)}" target="_blank" rel="noopener noreferrer">查看原题 ↗</a>`:''}${p.payload.rawSamples?.length?`<h3>原始样例</h3><pre>${escape(p.payload.rawSamples.join('\n\n'))}</pre>`:''}<p class="muted">在右侧编写完整程序，自行处理标准输入输出。</p></div></section><section class="glass editor-panel"><div class="panel-head"><strong>Python</strong><div class="editor-tools">${button('history','历史对照','quiet')}${button('rewrite','↻ 重新手撕','quiet')}</div></div>${draft.mode==='rewrite'?`<div class="rewrite-note"><span>原代码已保留，先独立完成这次重写。</span>${button('discard','放弃本次重写','quiet')}${button('finish','结束并对照','')}</div>`:''}<textarea id="code" class="code-editor" aria-label="代码" spellcheck="false" autocapitalize="off">${escape(draft.code)}</textarea><div class="editor-footer"><span class="muted">${escape(client.description||'浏览器内运行 · 最长 5 秒')}</span><div>${button('stop','停止','quiet')}${button('run','▷ 运行自测','primary')}</div></div><div class="test-grid"><label>标准输入 stdin<textarea id="stdin" spellcheck="false">${escape(draft.stdin)}</textarea></label><label>期望输出（可留空）<textarea id="expected" spellcheck="false">${escape(draft.expected)}</textarea></label></div><div id="result" class="result"><span id="result-label">运行后在这里查看结果</span><pre id="stdout"></pre><pre id="stderr"></pre></div></section></div><div id="comparison"></div><div class="section-heading">${button('review','明天再练','quiet')}<span class="muted">样例通过仅代表当前自测，不代表原平台隐藏测试 AC。</span></div>`;
  }
  function settingsPage(){return `<div class="settings"><div class="hero"><div><span class="eyebrow">YOUR WORKSPACE</span><h1 class="gradient">设置与数据</h1><p class="muted">你写下的内容，由你保留。</p></div></div><section class="glass"><h3>本机数据</h3><p class="muted">${escape(client.storage||'当前保存在此浏览器。清除网站数据会移除未备份的内容。')}</p><div class="setting-row"><div><strong>完整备份</strong><small>包括题目、草稿、重写记录和复习安排</small></div>${button('export','导出备份')}</div><div class="setting-row"><div><strong>恢复备份</strong><small>合并导入，已有冲突不会被覆盖</small></div><label><input id="backup-file" type="file" accept="application/json,.json"></label></div></section><section class="glass"><h3>练习偏好</h3><div class="setting-row"><label for="timezone">日期与复习时区</label><select id="timezone">${['Asia/Shanghai','Asia/Tokyo','Europe/London','America/New_York','America/Los_Angeles'].map(z=>`<option ${z===settings.timezone?'selected':''}>${z}</option>`).join('')}</select></div><div class="setting-row"><span>界面主题</span>${button('theme',settings.theme==='dark'?'切换浅色':'切换深色')}</div></section><section class="glass"><h3>账号与同步</h3>${account?.user?`<p>已连接 ${escape(account.user.login)} · 本机独立保存账号副本</p><p id="sync-status" class="muted">${escape(account.statusText())}</p><div class="actions">${button('sync','立即同步')}${button('conflicts','查看冲突')}${button('merge-guest','合并此设备的匿名练习')}${button('logout','退出账号')}</div><p class="muted">合并只在你点击后进行；冲突内容保留双方，可单独导出。</p>`:`<p class="muted">匿名练习保存在当前浏览器。登录后可以跨设备接续；登录不会自动上传匿名内容。</p>${account?.loginAvailable?'<a href="/api/auth/github/start">使用 GitHub 连接账号 ↗</a>':'<p class="muted">账号连接尚未配置；匿名练习可正常使用。</p>'}`}</section><section class="glass"><h3>AI</h3><p class="muted">自带 API 正在接入。</p><a href="${escape(client.legacyUrl||'/legacy.html')}">打开原版界面 ↗</a></section></div>`;}
  async function render(){
    root.querySelectorAll('nav button').forEach(b=>b.setAttribute('aria-current',b.dataset.action===`nav-${view}`?'page':'false'));
    $('content').innerHTML=view==='today'?await today():view==='library'?library():view==='practice'?await practice():settingsPage();
    if(view==='practice'){$('code').addEventListener('keydown',event=>{if(event.key==='Tab'){event.preventDefault();const el=event.target;el.setRangeText('    ',el.selectionStart,el.selectionEnd,'end');saveEditor().catch(e=>toast(e.message));}});}
  }
  let history=[];let historyCursor=null;
  async function compare(attemptId,older=false){
    if(!older&&!attemptId){const page=await store.listAttempts({problemId:selected,language:'python',limit:50});history=page.items;historyCursor=page.nextCursor;}
    else if(older&&historyCursor){const page=await store.listAttempts({problemId:selected,language:'python',cursor:historyCursor,limit:50});history.push(...page.items);historyCursor=page.nextCursor;}
    const attempts=history;
    const previous=attempts.find(a=>a.id===(attemptId||draft.previousAttemptId))||attempts.find(a=>a.reason==='before-rewrite')||attempts[0];
    if(!previous){toast('尚未开始过重写；点击“重新手撕”会先保留当前代码。');return;}
    $('comparison').innerHTML=`<div class="section-heading"><label>历史版本 <select id="history-version">${attempts.map(a=>`<option value="${escape(a.id)}" ${a.id===previous.id?'selected':''}>${escape(new Date(a.createdAt).toLocaleString())} · ${a.reason==='before-rewrite'?'重写前':a.reason==='completed-rewrite'?'重写完成':'导入记录'}</option>`).join('')}</select></label>${historyCursor?button('more-history','更早记录','quiet'):''}</div><div class="compare"><section class="glass"><div class="panel-head"><strong>上次代码 · 已保留</strong></div><pre>${escape(previous.code)}</pre></section><section class="glass"><div class="panel-head"><strong>本次代码</strong></div><pre>${escape(draft.code)}</pre></section></div>`;
    $('comparison').scrollIntoView({block:'nearest'});
  }
  async function run(){
    await saveEditor();const captured={...draft};output='';errorOutput='';$('stdout').textContent='';$('stderr').textContent='';$('result').dataset.state='';
    const id=crypto.randomUUID();runId=id;
    let runOutput='',runError='';
    const result=await runner.run({id,language:'python',code:captured.code,stdin:captured.stdin},event=>{
      if(event.type==='stdout')runOutput+=event.text;
      if(event.type==='stderr')runError+=event.text;
      if(runId!==id||view!=='practice'||selected!==captured.problemId)return;
      if(event.type==='loading')$('result-label').textContent='正在加载 Python…';
      if(event.type==='running')$('result-label').textContent='正在运行…';
      if(event.type==='stdout'){output+=event.text;$('stdout').textContent=output;}
      if(event.type==='stderr'){errorOutput+=event.text;$('stderr').textContent=errorOutput;}
      if(event.type==='error'){$('result-label').textContent=event.text;$('result').dataset.state='error';}
      if(event.type==='complete'){
        const normalize=s=>s.replace(/\r\n/g,'\n').trimEnd();
        const matches=normalize(output)===normalize(captured.expected);
        $('result-label').textContent=event.outputLimited?'输出超过上限，已截断':captured.expected===''?'运行完成（未设置期望输出）':matches?'样例通过':'输出与期望不一致';
        $('result').dataset.state=!event.outputLimited&&captured.expected!==''&&matches?'success':'';
      }
    });
    if(!await store.getMeta(`deleted:${captured.problemId}`))await store.putRecord({kind:'run',id,problemId:captured.problemId,language:captured.language,payload:{code:captured.code,stdin:captured.stdin,expected:captured.expected,stdout:runOutput,stderr:runError,error:result.text||'',status:result.cancelled?'cancelled':result.kind==='error'?'error':result.outputLimited?'output_limit':captured.expected&&runOutput.replace(/\r\n/g,'\n').trimEnd()===captured.expected.replace(/\r\n/g,'\n').trimEnd()?'self_pass':'complete',createdAt:Date.now()}});
  }
  async function showConflicts(){
    let dialog=$('conflicts-dialog');
    if(!dialog){dialog=document.createElement('dialog');dialog.id='conflicts-dialog';root.append(dialog);}
    const conflicts=await store.syncConflicts();
    dialog.innerHTML=`<div class="dialog-title"><h2>同步冲突 · 保留双方</h2>${button('close-conflicts','关闭')}</div><p>在选择之前，两个版本都会保留。云端彻底删除的内容只能导出后以新题保存。</p>${conflicts.map(c=>`<section><h3>${escape(c.local.kind)} · ${escape(c.local.id)}</h3><div class="compare"><pre>${escape(c.local.payload?.code??JSON.stringify(c.local.payload,null,2))}</pre><pre>${escape(c.remote?.deleted?'云端已彻底删除':c.remote?.payload?.code??JSON.stringify(c.remote?.payload,null,2))}</pre></div><div class="actions">${c.remote?.deleted?'':button('keep-local','保留本地','',c.key)}${button('keep-cloud','保留云端','',c.key)}${button('export-conflict','导出双方内容','',c.key)}</div></section>`).join('')||'<p>当前没有冲突。</p>'}`;
    if(!dialog.open)dialog.showModal();
  }
  let deleting=null;
  root.addEventListener('click',async event=>{
    const target=event.target.closest('[data-action]');if(!target)return;
    const action=target.dataset.action,id=target.dataset.id;
    try{
      if(action==='sync'){await account.sync();await refresh();await render();}
      if(action==='merge-guest'){const result=await account.mergeGuest();toast(`合并 ${result.imported} 条，保留冲突 ${result.conflicts.length} 条。`);await refresh();await render();}
      if(action==='logout')await account.logout();
      if(action==='conflicts')await showConflicts();
      if(action==='close-conflicts')$('conflicts-dialog').close();
      if(action==='keep-local'||action==='keep-cloud'){await store.syncResolve(id,action==='keep-local'?'local':'cloud');await account.sync();await showConflicts();}
      if(action==='export-conflict'){
        const item=(await store.syncConflicts()).find(c=>c.key===id);const url=URL.createObjectURL(new Blob([JSON.stringify(item,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='acmcoder-conflict.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
      }
      if(action.startsWith('nav-'))return await navigate(action.slice(4));
      if(action==='practice')return await navigate('practice',id);
      if(action==='theme'){settings.theme=settings.theme==='dark'?'light':'dark';document.documentElement.dataset.theme=settings.theme;await store.putRecord({kind:'settings',id:'preferences',payload:settings});if(view==='settings')await render();}
      if(action.startsWith('filter-')){filter=action.slice(7);await render();}
      if(action==='open-import'){$('import-note').textContent='';$('import-dialog').showModal();}
      if(action==='recommend-import'){const item=catalog.find(p=>p.leetcodeSlug===id);$('import-url').value=item.leetcodeUrl;$('import-title').value=item.title;$('import-statement').value='';$('import-samples').value='';$('import-note').textContent='点击“读取公开题面”，或粘贴原题题面与样例。';$('import-dialog').showModal();}
      if(action==='close-import')$('import-dialog').close();
      if(action==='fetch-import'){
        $('import-note').textContent='正在读取公开题面…';
        if(client.fetchProblem){const data=await client.fetchProblem($('import-url').value);$('import-title').value=data.title||'';$('import-statement').value=data.statement||'';$('import-samples').value=(data.rawSamples||[]).join('\n\n');$('import-note').textContent='题面与原始样例已读取，请确认后导入。';return;}
        const response=await fetch('/api/import/fetch',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({url:$('import-url').value})});
        const data=await response.json();
        if(!response.ok){$('import-note').textContent=response.status===401?'当前公开抓取需要原网站账号；可以直接粘贴题面和样例，填写内容会保留。':data.error;return;}
        $('import-title').value=data.title||'';$('import-statement').value=data.statement||'';$('import-note').textContent='题面已读取，请检查样例后导入。';
      }
      if(action==='save-import'){
        const payload=normalizeProblem({title:$('import-title').value,statement:$('import-statement').value,sourceUrl:$('import-url').value.trim(),sourceKind:'manual',rawSamples:$('import-samples').value?[$('import-samples').value]:[]});
        const duplicate=payload.sourceUrl&&problems.find(p=>p.payload.sourceUrl===payload.sourceUrl);
        if(duplicate){$('import-dialog').close();await navigate('practice',duplicate.id);toast('这道题已在题库中，已保留现有代码。');return;}
        const nextId=crypto.randomUUID();await store.putRecord({kind:'problem',id:nextId,payload});$('import-dialog').close();await navigate('practice',nextId);
      }
      if(action==='run')await run();
      if(action==='stop'&&runId)runner.cancel(runId);
      if(action==='rewrite'){await saveEditor();draft=await store.startRewrite({problemId:selected,language:'python',template:templates.python});await render();}
      if(action==='finish'){await saveEditor();draft=await store.finishRewrite({problemId:selected,language:'python'});await render();await compare();}
      if(action==='discard'){draft=await store.discardRewrite({problemId:selected,language:'python'});await render();toast('已放弃本次重写，原记录仍保留。');}
      if(action==='history'){await saveEditor();await compare();}
      if(action==='more-history')await compare($('history-version')?.value,true);
      if(action==='archive'){await store.archiveProblem(id);await refresh();await render();toast('已归档，记录完整保留。');}
      if(action==='restore'){await store.restoreProblem(id);await refresh();await render();}
      if(action==='delete'){deleting=id;$('delete-dialog').showModal();}
      if(action==='cancel-delete')$('delete-dialog').close();
      if(action==='confirm-delete'){await store.deleteProblem(deleting,{confirmed:true});$('delete-dialog').close();await refresh();await render();}
      if(action==='review'){await store.putRecord({kind:'review',id:`review-${selected}`,problemId:selected,payload:{dueDay:tomorrow(),completedAt:null}});toast(`已加入 ${tomorrow()} 的复习安排。`);}
      if(action==='complete-plan'){const key=`plan-${day()}`;const plans=(await store.getRecord({kind:'plan',id:key}))?.payload.completed||{};plans[id]=!plans[id];await store.putRecord({kind:'plan',id:key,payload:{day:day(),timezone:settings.timezone,completed:plans}});const review=await store.getRecord({kind:'review',id:`review-${id}`});if(review){review.payload.completedAt=plans[id]?Date.now():null;await store.putRecord(review);}await render();}
      if(action==='export'){const backup=await store.exportBackup();const url=URL.createObjectURL(new Blob([JSON.stringify(backup,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=`acmcoder-${day()}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);toast('完整备份已导出。');}
    }catch(error){if($('import-dialog').open)$('import-note').textContent=error.message;else toast(error.message);}
  });
  root.addEventListener('input',event=>{
    if(['code','stdin','expected'].includes(event.target.id))saveEditor().catch(error=>toast(error.message));
    if(event.target.id==='search'){query=event.target.value;const position=event.target.selectionStart;$('content').innerHTML=library();$('search').focus();$('search').setSelectionRange(position,position);}
  });
  root.addEventListener('change',async event=>{
    try{
      if(event.target.id==='history-version')await compare(event.target.value);
      if(event.target.id==='daily-count'||event.target.id==='timezone'){
        if(event.target.id==='history-version')await compare(event.target.value);
      if(event.target.id==='daily-count')settings.count=Number(event.target.value);else settings.timezone=event.target.value;
        await store.putRecord({kind:'settings',id:'preferences',payload:settings});await render();
      }
      if(event.target.id==='backup-file'&&event.target.files[0]){const result=await store.restoreBackup(JSON.parse(await event.target.files[0].text()),{mode:'merge'});await refresh();toast(`恢复 ${result.imported} 条，已有 ${result.skipped} 条，冲突 ${result.conflicts.length} 条（未覆盖）。`);}
    }catch(error){toast(error.message);}
  });
  const leaving=()=>{if(view==='practice')saveEditor().catch(()=>{});};
  window.addEventListener('pagehide',leaving);
  await render();
  return {navigate,async refreshFromCloud(){await refresh();await render();},destroy(){window.removeEventListener('pagehide',leaving);runner.destroy?.();}};
}
