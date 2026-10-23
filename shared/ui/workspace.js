import {templates} from '../practice.js';
import {normalizeProblem} from '../import.js';
import {createAIPanel} from './ai.js';
import {resolveProblemRequest,verifyProblemCandidate} from '../ai-import.js';
import {normalizeBackup} from '../backup.js';
import {getDailyQueue,completeDailyProblem,deferDailyProblem,replaceDailyProblem} from '../daily-queue.js';
import {normalizeCases,runCaseBatch,queryRunHistory} from '../workbench.js';
import {mountCodeEditor} from './editor.js';
import {mountWorkspaceLayout} from './workspace-layout.js';
import {renderPractice,renderCaseControls,renderCaseResults,renderRunHistory,renderDiff} from './workbench-view.js';

const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const example={kind:'problem',id:'sum',payload:{title:'两个整数相加',statement:'读取两个整数，输出它们的和。\n\n输入：一行两个整数，以空格分隔。\n输出：两个整数的和。',sourceKind:'builtin',tags:['入门','标准输入输出'],rawSamples:['输入：3 5\n输出：8'],cases:[{stdin:'3 5\n',expected:'8\n'}],archivedAt:null}};
export async function mountWorkspace(root,{store,runner,account,catalog=[],client={},clock=()=>new Date()}) {
  const ai=client.ai?await createAIPanel({store,adapter:client.ai}):null;
  const languages=client.languages||['python'];let language=languages[0];
  let view='today',selected='sum',filter='mine',query='',draft=null,runId=null,noticeTimer=null,navigation=0,runEpoch=0;
  let saveState='已保存到此设备';
  let editor=null,layout=null,batchController=null,selectedCase=-1,practicePanel='code';
  const layoutPreferences=await store.getMeta('workspace-layout')||{};
  let historyFilters={problemId:'',language:'',day:''},runHistoryPage=1,runHistoryOpen=false;
  let releaseInfo;
  let pendingBackup=null;
  let legacyProgress=new Map();
  let problems=[],settings={theme:'light',timezone:'Asia/Shanghai',count:3},output='',errorOutput='',importKind='manual',importCases=[],candidates=[];
  let findText=await store.getMeta('problem-request')||'';
  let last=await store.getMeta('location');
  let lastPractice=await store.getMeta('last-practice');
  const savedSettings=await store.getRecord({kind:'settings',id:'preferences'});
  if(savedSettings)settings={...settings,...savedSettings.payload};
  document.documentElement.dataset.theme=settings.theme;
  if(!await store.getMeta('initialized')){
    if(!await store.getRecord({kind:'problem',id:'sum'})&&!await store.getMeta('deleted:sum'))await store.putRecord(example);
    const old=globalThis.localStorage?.getItem('acmcoder-free-draft-v1:sum');
    let values={code:'a, b = map(int, input().split())\nprint(a + b)\n',stdin:'3 5\n',expected:'8\n'};
    try{if(old)values={...values,...JSON.parse(old)};}catch{/* retain original legacy key */}
    if(!await store.getMeta('deleted:sum')&&!await store.getDraft({problemId:'sum',language}))await store.saveDraft({problemId:'sum',language,...values,mode:'normal'});
    await store.setMeta('initialized',true);
  }
  async function refresh(){
    problems=await store.listRecords({kind:'problem'});
    legacyProgress=new Map((await store.listRecords({kind:'progress'})).filter(r=>r.payload.legacyProgress).map(r=>[r.problemId,r.payload]));
  }
  function progressLabel(id){const row=legacyProgress.get(id);return row?`旧版自测通过 ${row.successes} 次`:'';}
  await refresh();
  if(last&&problems.some(p=>p.id===last.problemId)){selected=last.problemId;view=last.view;if(languages.includes(last.language))language=last.language;}
  if(!lastPractice&&last?.view==='practice'&&problems.some(p=>p.id===last.problemId)){
    lastPractice={problemId:last.problemId,language:last.language};await store.setMeta('last-practice',lastPractice);
  }
  const $=id=>root.querySelector(`#${id}`);
  const problem=()=>problems.find(p=>p.id===selected);
  const button=(action,label,cls='',id='')=>`<button type="button" class="${cls}" data-action="${action}"${id?` data-id="${escape(id)}"`:''}>${label}</button>`;
  function toast(message){clearTimeout(noticeTimer);const el=$('notice');el.textContent=message;el.hidden=false;noticeTimer=setTimeout(()=>{el.hidden=true;},7000);}
  const day=(date=clock())=>new Intl.DateTimeFormat('en-CA',{timeZone:settings.timezone,year:'numeric',month:'2-digit',day:'2-digit'}).format(date);
  function tomorrow(){const [y,m,d]=day().split('-').map(Number);return new Date(Date.UTC(y,m-1,d+1)).toISOString().slice(0,10);}
  root.innerHTML=`<header class="glass"><div class="brand"><b>✦</b>ACMCoder</div><nav aria-label="工作区">${['today','library','practice','history'].map((name,i)=>button(`nav-${name}`,['☀ 今日','▤ 题库','⌘ 练习','◷ 记录'][i])).join('')}</nav><div class="head-actions">${button('theme','◐','quiet')}${button('nav-settings','设置与数据','quiet')}</div></header><main id="content"></main><div id="notice" class="status-message" role="status" hidden></div>
    <dialog id="import-dialog"><div class="dialog-title"><h2>导入题目</h2>${button('close-import','✕','quiet')}</div><p class="muted">保留题面和原始样例，ACM 输入由你自行调整。</p><label>原题链接<input id="import-url" type="url" placeholder="https://leetcode.cn/problems/…/"></label>${button('fetch-import','读取公开题面','quiet')}<label>题目名称<input id="import-title" maxlength="160" placeholder="例如：两数之和"></label><label>题面<textarea id="import-statement" placeholder="粘贴题面，或从原题链接读取"></textarea></label><label>原始样例<textarea id="import-samples" placeholder="保留原平台样例，不自动转换函数参数"></textarea></label><label>ACM 样例输入（可选）<textarea id="import-stdin"></textarea></label><label>ACM 样例期望输出（可选）<textarea id="import-expected"></textarea></label><p id="import-note" class="muted" role="status"></p><footer>${button('close-import','取消','quiet')}${button('save-import','导入并开始练习','primary')}</footer></dialog>
    <dialog id="delete-dialog"><h2>彻底删除这道题？</h2><p id="delete-scope"></p><p>本机的题面、草稿、历史、对话与复习安排将一并删除，每日计划中移除该题；已连接账号时会同步删除。此操作无法撤销；需要保留时请先导出备份。</p><footer>${button('cancel-delete','取消')}${button('confirm-delete','彻底删除','danger')}</footer></dialog>`;
  const status=document.createElement('div');status.className='workspace-status';status.innerHTML='<span id="workspace-save-status" role="status"></span><button type="button" class="quiet" data-action="nav-settings"><span id="workspace-sync-status"></span></button>';
  root.querySelector('header').after(status);
  function refreshStatus(){
    $('workspace-save-status').textContent=saveState;
    $('workspace-sync-status').textContent=account?.user?`${account.user.login} · ${account.statusText()}`:'匿名练习 · 仅保存在此设备';
    if($('sync-status')&&account?.user)$('sync-status').textContent=account.statusText();
  }
  function setSaveState(value){saveState=value;if($('save-status'))$('save-status').textContent=value;refreshStatus();}
  async function persistLocation(){
    await store.setMeta('location',{view,problemId:selected,language});
    if(view==='practice'){lastPractice={problemId:selected,language,visitedAt:clock().getTime()};await store.setMeta('last-practice',lastPractice);}
  }
  function cancelRun(){const id=runId,batch=batchController;runId=null;batchController=null;runEpoch++;batch?.abort();if(id&&!batch)runner.cancel(id);}
  async function fetchSource(url){
    if(client.fetchProblem)return client.fetchProblem(url);
    const response=await fetch('/api/import/fetch',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({url})});const result=await response.json();if(!response.ok)throw new Error(result.error||'原题读取失败。');return result;
  }
  function fillImport(candidate){
    importKind=candidate.sourceKind||'manual';importCases=candidate.cases||[];$('import-url').value=candidate.sourceUrl||'';$('import-title').value=candidate.title||'';$('import-statement').value=candidate.statement||'';$('import-samples').value=(candidate.rawSamples?.length?candidate.rawSamples:importCases.map(c=>`输入：${c.stdin}\n输出：${c.expected}`)).join('\n\n');
    $('import-stdin').value=candidate.cases?.[0]?.stdin||'';$('import-expected').value=candidate.cases?.[0]?.expected||'';
    $('import-note').textContent=candidate.warning?`${candidate.warning}；可用插件捕获原题，或在这里粘贴题面和样例。`:importKind==='ai-original'?'AI 原创：样例由模型生成，请自行检查。':importKind==='verified-source'?'已读取原题题面和样例，请确认后导入。':'原题链接尚未验证，请读取原题或粘贴题面。';
    $('import-dialog').showModal();
  }
  async function saveEditor(){
    editor?.flush();
    if(!draft||!$('code'))return;
    const current={...draft,code:$('code').value,stdin:$('stdin').value,expected:$('expected').value};
    draft=current;
    setSaveState('正在保存…');
    try{await store.saveDraft(current);if(draft===current)setSaveState('已保存到此设备');}
    catch(error){if(draft===current)setSaveState('保存失败，请保留当前页面');throw error;}
  }
  async function navigate(next,id){
    const epoch=++navigation;
    if(view==='practice')await saveEditor();
    cancelRun();
    if(epoch!==navigation)return;
    view=next;if(id)selected=id;selectedCase=-1;runHistoryOpen=false;
    if(next==='history'){historyFilters={problemId:'',language:'',day:''};runHistoryPage=1;}
    await refresh();
    if(view==='practice'&&!problem()){view='library';}
    await persistLocation();await render();
  }
  async function today(){
    const {entries,canReplace}=await getDailyQueue({store,day:day(),count:settings.count,lastPractice,timezone:settings.timezone});
    const recent=problems.find(p=>p.id===lastPractice?.problemId&&!p.payload.archivedAt);
    const reasons={review:'到期复习',resume:'继续未完成练习',practice:'从我的题库安排'};
    return `<div class="hero"><div><div class="eyebrow">YOUR DAILY PRACTICE</div><h1 class="gradient">今天，从一题开始。</h1><p class="muted">把昨天的思路，变成今天能独立写出的代码。</p></div><div class="orb" aria-hidden="true">✦</div></div>${recent?`<section class="continue glass"><div class="continue-icon">⌘</div><div><span class="eyebrow">继续上次练习</span><h3>${escape(recent.payload.title)}</h3><span class="muted">你的代码和输入都留在这里</span></div>${button('practice','继续练习 ↗','primary',recent.id)}</section>`:''}<div class="section-heading"><div><h2>今日安排</h2><span class="muted">${day()} · 按自己的节奏来</span></div><label class="muted">题量 <select id="daily-count">${[1,2,3,4,5].map(n=>`<option ${n===settings.count?'selected':''}>${n}</option>`).join('')}</select></label></div><div class="cards">${entries.map(({problem:p,reason,completed})=>`<article class="card glass"><span class="tag">${reasons[reason]||'我的题目'}</span><h3>${escape(p.payload.title)}</h3><p class="muted">${escape(p.payload.tags?.join(' · ')||'完整程序 · ACM 输入输出')}</p><div class="card-footer">${button('complete-plan',completed?'✓ 已完成':'标记完成','quiet',p.id)}${button('practice','开始 →','',p.id)}</div><div class="card-footer">${button('defer-plan','推迟到明天','quiet',p.id)}${canReplace?button('replace-plan','换一道','quiet',p.id):''}</div></article>`).join('')||'<div class="empty">今日暂无待练题目。可以去题库选题，或调整题量。</div>'}</div><div class="section-heading"><span class="muted">当天安排已保存；推迟的题今天不再补回，完成状态和历史始终保留。</span>${button('nav-library','去题库找题 →','quiet')}</div>`;
  }
  function libraryRows(){
    if(filter==='recommend')return catalog.filter(p=>(p.title+' '+p.tags.join(' ')).includes(query)).map(p=>`<article class="row"><div class="row-title"><h3>${escape(p.title)}</h3><div class="muted">${escape(p.tags.join(' · '))}</div></div><span class="tag">${{easy:'简单',medium:'中等',hard:'困难'}[p.difficulty]||''}</span>${button('recommend-import','导入练习 →','',p.leetcodeSlug)}</article>`).join('')||'<div class="empty">没有匹配的推荐题。</div>';
    const items=problems.filter(p=>filter==='archive'?!!p.payload.archivedAt:!p.payload.archivedAt).filter(p=>(p.payload.title+' '+p.payload.tags?.join(' ')).toLowerCase().includes(query.toLowerCase()));
    return items.map(p=>`<article class="row"><div class="row-title"><h3>${escape(p.payload.title)}</h3><div class="muted">${escape(p.payload.tags?.join(' · ')||'ACM 完整程序练习')}${legacyProgress.has(p.id)?` · ${escape(progressLabel(p.id))}`:''}</div></div><span class="tag">${p.payload.sourceKind==='builtin'?'内置示例':p.payload.sourceKind==='ai-original'?'AI 原创':p.payload.sourceKind==='verified-source'?'已读取原题':p.payload.sourceUrl?'外部来源':'手动导入'}</span><div class="row-actions">${filter==='archive'?button('restore','恢复','',p.id)+button('delete','彻底删除','danger',p.id):button('practice','练习 →','',p.id)+button('archive','归档','quiet',p.id)}</div></article>`).join('')||'<div class="empty">这里还没有题目。</div>';
  }
  function library(){
    const recommended=filter==='recommend';
    return `<div class="hero"><div><div class="eyebrow">${recommended?'DISCOVER YOUR NEXT CHALLENGE':'YOUR PROBLEM LIBRARY'}</div><h1 class="gradient">${recommended?'下一题，从这里开始。':'让每一道题，都有下文。'}</h1><p class="muted">${recommended?'来自已有高频题目录，导入时读取真实题面。':'收集、练习、重写。你的积累都留在这里。'}</p></div>${button('open-import','＋ 导入题目','primary')}</div><div class="toolbar"><div class="tabs"><button data-action="filter-mine" aria-pressed="${filter==='mine'}">我的题库</button><button data-action="filter-recommend" aria-pressed="${recommended}">推荐题目</button><button data-action="filter-archive" aria-pressed="${filter==='archive'}">已归档</button></div><input id="search" class="search" placeholder="搜索题目或标签" aria-label="搜索题目" value="${escape(query)}"></div><div id="library-rows" class="rows glass">${libraryRows()}</div>`;
  }
  async function practice(){
    const p=problem();
    draft=await store.getDraft({problemId:selected,language});
    if(!draft)draft=await store.saveDraft({problemId:selected,language,code:templates[language],stdin:p.payload.cases?.[0]?.stdin||'',expected:p.payload.cases?.[0]?.expected||'',mode:'normal'});
    if(selectedCase>=(p.payload.cases?.length||0))selectedCase=-1;
    return renderPractice({problem:p,draft,languages,language,progress:progressLabel(p.id),description:client.description,selectedCase})+`<div class="section-heading">${button('review','明天再练','quiet')}${client.handoff?button('handoff',client.handoffLabel||'在另一端继续 ↗','quiet'):''}<span class="muted">样例通过仅代表当前自测，不代表原平台隐藏测试 AC。</span></div>`;
  }
  async function runHistoryHTML(){
    const page=queryRunHistory(await store.listRecords({kind:'run'}),{...historyFilters,timeZone:settings.timezone,page:runHistoryPage});
    runHistoryPage=page.page;
    return renderRunHistory({page,problems,languages,filters:historyFilters,timeZone:settings.timezone});
  }
  async function showRunHistory(){
    const context=navigation,html=await runHistoryHTML();
    if(context!==navigation)return;
    const container=view==='history'?$('content'):$('run-history');
    if(container){container.innerHTML=html;runHistoryOpen=true;}
  }
  function resetResult(){
    output='';errorOutput='';$('stdout').textContent='';$('stderr').textContent='';$('result').dataset.state='';
    $('result-label').textContent='运行后在这里查看结果';$('case-results').innerHTML='';
  }
  async function saveCase(action){
    await saveEditor();
    const current=problem(),cases=normalizeCases(current.payload.cases||[]);
    if(action!=='case-add'&&(selectedCase<0||selectedCase>=cases.length))throw new Error('请先选择一组已保存的样例。');
    if(action==='case-add')cases.push({stdin:$('stdin').value,expected:$('expected').value});
    if(action==='case-update')cases[selectedCase]={stdin:$('stdin').value,expected:$('expected').value};
    if(action==='case-delete')cases.splice(selectedCase,1);
    const updated={...current,payload:{...current.payload,cases:normalizeCases(cases)}};
    await store.putRecord(updated);problems=problems.map(p=>p.id===updated.id?updated:p);
    selectedCase=action==='case-add'?cases.length-1:action==='case-delete'?-1:selectedCase;
    cancelRun();resetResult();$('case-controls').innerHTML=renderCaseControls(cases,selectedCase);
    $('run-all').disabled=!cases.length;
    toast(action==='case-delete'?'已移除样例；当前输入和历史仍保留。':'样例已保存到题目。');
  }
  async function runAll(){
    cancelRun();const epoch=runEpoch;await saveEditor();if(epoch!==runEpoch||view!=='practice')return;
    const captured={...draft},cases=normalizeCases(problem().payload.cases||[]);
    if(!cases.length)throw new Error('请先保存至少一组自测样例。');
    const controller=new AbortController();batchController=controller;
    const visible=()=>epoch===runEpoch&&view==='practice'&&selected===captured.problemId;
    const results=[];resetResult();layout?.setPanel('result');
    try{
      const batch=await runCaseBatch({runner,language:captured.language,code:captured.code,cases,signal:controller.signal,clock:()=>clock().getTime(),
        onEvent(event){
          if(!visible())return;
          if(event.type==='case-start'){runId=event.id;output='';errorOutput='';$('stdout').textContent='';$('stderr').textContent='';$('result-label').textContent=`正在运行样例 ${event.caseIndex+1} / ${cases.length}…`;}
          if(event.type==='stdout'){output+=event.text;$('stdout').textContent=output;}
          if(event.type==='stderr'){errorOutput+=event.text;$('stderr').textContent=errorOutput;}
        },
        async onResult(result){
          results.push(result);
          if(visible())$('case-results').innerHTML=renderCaseResults(results,cases.length);
          if(!await store.getMeta(`deleted:${captured.problemId}`)){
            const {id,language:resultLanguage,...payload}=result;
            await store.putRecord({kind:'run',id,problemId:captured.problemId,language:resultLanguage,payload});
          }
        }});
      if(visible()){
        const passed=batch.results.filter(r=>r.status==='self_pass').length;
        $('result-label').textContent=batch.cancelled?'已停止':`全部样例运行完成：${passed} / ${batch.total} 组通过`;
        $('result').dataset.state=!batch.cancelled&&passed===batch.total?'success':'';
        if(runHistoryOpen)await showRunHistory();
      }
    }catch(error){if(visible()){$('result-label').textContent=`批量运行未完成：${error.message}`;$('result').dataset.state='error';}throw error;}
    finally{if(batchController===controller){batchController=null;runId=null;}}
  }
  const versionLabel=()=>releaseInfo?`${releaseInfo.version}${releaseInfo.channel==='development'?' · 开发构建（未发布）':releaseInfo.channel==='candidate'?' · 候选版':''} · ${releaseInfo.commit?.slice(0,7)} · ${releaseInfo.languages?.join(' / ')}`:'';
  function settingsPage(){
    if(releaseInfo===undefined){releaseInfo=null;fetch(new URL('../../version.json',import.meta.url),{signal:AbortSignal.timeout(3000)}).then(response=>response.ok?response.json():null).then(info=>{releaseInfo=info;const label=$('release-version');if(label)label.textContent=versionLabel();}).catch(()=>{});}
    return `<div class="settings"><div class="hero"><div><span class="eyebrow">YOUR WORKSPACE</span><h1 class="gradient">设置与数据</h1><p class="muted">你写下的内容，由你保留。</p><p id="release-version" class="muted">${escape(versionLabel())}</p></div></div><section class="glass"><h3>本机数据</h3><p class="muted">${escape(client.storage||'当前保存在此浏览器。清除网站数据会移除未备份的内容。')}</p><div class="setting-row"><div><strong>完整备份</strong><small>包括题目、草稿、历史、对话和待处理恢复冲突</small></div>${button('export','导出备份')}</div><div class="setting-row"><div><strong>恢复备份</strong><small>合并导入，已有冲突不会被覆盖</small></div><label><input id="backup-file" type="file" accept="application/json,.json"></label></div></section><section class="glass"><h3>待处理的恢复</h3><p class="muted">备份恢复或匿名练习合并产生的冲突可随时查看。</p>${button('backup-conflicts','查看恢复冲突')}</section><section class="glass"><h3>练习偏好</h3><div class="setting-row"><label for="timezone">日期与复习时区</label><select id="timezone">${['Asia/Shanghai','Asia/Tokyo','Europe/London','America/New_York','America/Los_Angeles'].map(z=>`<option ${z===settings.timezone?'selected':''}>${z}</option>`).join('')}</select></div><div class="setting-row"><span>界面主题</span>${button('theme',settings.theme==='dark'?'切换浅色':'切换深色')}</div></section><section class="glass"><h3>账号与同步</h3>${account?.user?`<p>已连接 ${escape(account.user.login)} · 本机独立保存账号副本</p><p id="sync-status" class="muted">${escape(account.statusText())}</p><div class="actions">${button('sync','立即同步')}${button('conflicts','查看冲突')}${button('merge-guest','合并此设备的匿名练习')}${button('logout','退出账号')}${account.connect?`${account.rememberOption?`<label><input id="remember-device" type="checkbox" ${account.remember?'checked':''}> 保持连接，最多 30 天</label>`:''}${button('connect-account','重新连接账号 ↗')}`:''}${account.devices?button('devices','已连接的设备'):''}${account.usage?button('cloud-usage','查看云端容量'):''}${account.deleteCloud?button('delete-account','删除云端账号数据','danger'):''}</div><p class="muted">合并只在你点击后进行；冲突内容保留双方，可单独导出。</p>`:`<p class="muted">匿名练习保存在当前浏览器。登录后可以跨设备接续；登录不会自动上传匿名内容。</p>${account?.connect?`${account.rememberOption?'<label><input id="remember-device" type="checkbox"> 保持连接，最多 30 天</label>':''}${button('connect-account','连接 GitHub 账号 ↗')}`:account?.loginAvailable?'<a href="/api/auth/github/start">使用 GitHub 连接账号 ↗</a>':'<p class="muted">账号连接尚未配置；匿名练习可正常使用。</p>'}`}</section><section class="glass"><h3>数据与隐私</h3><p class="muted">查看设备保存、云端同步、API Key、备份和删除规则。</p><a href="${escape(new URL('../privacy.html',import.meta.url).href)}" target="_blank" rel="noopener noreferrer">阅读数据与隐私说明 ↗</a></section><section class="glass"><h3>AI</h3><p class="muted">自带 API 正在接入。</p><a href="${escape(client.legacyUrl||'/legacy.html')}">打开原版界面 ↗</a></section></div>`;}
  async function render(){
    editor?.destroy();editor=null;layout?.destroy();layout=null;
    refreshStatus();
    root.dataset.view=view;
    root.querySelectorAll('nav button').forEach(b=>b.setAttribute('aria-current',b.dataset.action===`nav-${view}`?'page':'false'));
    $('content').innerHTML=view==='today'?await today():view==='library'?library():view==='practice'?await practice():view==='history'?await runHistoryHTML():settingsPage();
    if(view==='library'){
      const finder=document.createElement('section');finder.className='glass finder-panel';finder.innerHTML=`<h3>想练哪道题？</h3><div class="finder-form"><label>找题描述<input id="problem-request" maxlength="2000" value="${escape(findText)}" placeholder="例如：导入 LeetCode 二分查找，或生成一道原创求和题"></label><div class="actions">${button('find-problems','查找题目','primary')}</div></div><p id="finder-status" role="status" class="muted">优先找已有题目和目录；AI 建议在读取原题前保持未验证。</p><div id="finder-candidates"></div>`;$('content').querySelector('.hero').after(finder);
    }
    if(view==='settings'&&client.offline){const panel=document.createElement('section');panel.className='glass';$('content').querySelector('.settings').insertBefore(panel,$('content').querySelector('.settings>section:last-child'));client.offline.mount(panel);}
    if(ai&&['settings','practice'].includes(view)){
      if(view==='settings')$('content').querySelector('.settings>section:last-child').remove();
      const panel=document.createElement('section');panel.className='glass ai-panel';
      if(view==='practice'){
        const drawer=document.createElement('details');drawer.className='glass practice-ai';
        const summary=document.createElement('summary');summary.textContent='✦ AI 问答';drawer.append(summary,panel);
        $('content').append(drawer);
      }else $('content').querySelector('.settings').append(panel);
      await ai.mount(panel,view==='practice'?{problemId:selected,language,context:()=>({title:problem()?.payload.title,statement:problem()?.payload.statement,code:$('code')?.value,stdin:$('stdin')?.value,language})}:{});
    }
    if(view==='practice'){
      editor=mountCodeEditor({textarea:$('code'),language,onRun:()=>run().catch(error=>toast(error.message)),onChange:()=>saveEditor().catch(error=>toast(error.message)),onStatus:text=>{if($('editor-status'))$('editor-status').textContent=text;}});
      layout=mountWorkspaceLayout({shell:$('practice-shell'),workspace:$('practice-workspace'),splitter:$('workspace-splitter'),initialWidth:layoutPreferences.width,initialPanel:practicePanel,onPanelChange:panel=>{practicePanel=panel;},onWidthChange:width=>{layoutPreferences.width=width;store.setMeta('workspace-layout',layoutPreferences).catch(error=>toast(error.message));}});
    }
  }
  let history=[];let historyCursor=null;
  async function compare(attemptId,older=false){
    if(!older&&!attemptId){const page=await store.listAttempts({problemId:selected,language,limit:50});history=page.items;historyCursor=page.nextCursor;}
    else if(older&&historyCursor){const page=await store.listAttempts({problemId:selected,language,cursor:historyCursor,limit:50});history.push(...page.items);historyCursor=page.nextCursor;}
    const attempts=history;
    const previous=attempts.find(a=>a.id===(attemptId||draft.previousAttemptId))||attempts.find(a=>a.reason==='before-rewrite')||attempts[0];
    if(!previous){toast('尚未开始过重写；点击“重新手撕”会先保留当前代码。');return;}
    $('comparison').innerHTML=`<div class="section-heading"><label>历史版本 <select id="history-version">${attempts.map(a=>`<option value="${escape(a.id)}" ${a.id===previous.id?'selected':''}>${escape(new Date(a.createdAt).toLocaleString())} · ${a.reason==='before-rewrite'?'重写前':a.reason==='completed-rewrite'?'重写完成':'导入记录'}</option>`).join('')}</select></label>${historyCursor?button('more-history','更早记录','quiet'):''}</div><div class="compare"><section class="glass"><div class="panel-head"><strong>上次代码 · 已保留</strong></div><pre>${escape(previous.code)}</pre></section><section class="glass"><div class="panel-head"><strong>本次代码</strong></div><pre>${escape(draft.code)}</pre></section></div>`;
    $('comparison').innerHTML+=`<section class="glass history-panel"><h3>代码差异 · − 上次 / + 本次</h3>${renderDiff(previous.code,draft.code)}<h3>标准输入差异</h3>${renderDiff(previous.stdin||'',draft.stdin||'')}<h3>期望输出差异</h3>${renderDiff(previous.expected||'',draft.expected||'')}</section>`;
    $('comparison').scrollIntoView({block:'nearest'});
  }
  async function run(){
    cancelRun();const epoch=runEpoch;await saveEditor();if(epoch!==runEpoch||view!=='practice')return;
    const captured={...draft};$('case-results').innerHTML='';output='';errorOutput='';$('stdout').textContent='';$('stderr').textContent='';$('result').dataset.state='';
    layout?.setPanel('result');
    const id=crypto.randomUUID();runId=id;
    let runOutput='',runError='';
    const result=await runner.run({id,language:captured.language,code:captured.code,stdin:captured.stdin},event=>{
      if(event.type==='stdout')runOutput+=event.text;
      if(event.type==='stderr')runError+=event.text;
      if(runId!==id||view!=='practice'||selected!==captured.problemId)return;
      if(event.type==='loading')$('result-label').textContent=event.text||`正在加载 ${{python:'Python',cpp:'C++',java:'Java'}[captured.language]}…`;
      if(event.type==='compiling')$('result-label').textContent=event.text||'正在编译…';
      if(event.type==='running')$('result-label').textContent='正在运行…';
      if(event.type==='stdout'){output+=event.text;$('stdout').textContent=output;}
      if(event.type==='stderr'){errorOutput+=event.text;$('stderr').textContent=errorOutput;}
      if(event.type==='cancelled')$('result-label').textContent='已停止';
      if(event.type==='error'){$('result-label').textContent=event.text;$('result').dataset.state='error';}
      if(event.type==='complete'){
        const normalize=s=>s.replace(/\r\n/g,'\n').trimEnd();
        const matches=normalize(output)===normalize(captured.expected);
        $('result-label').textContent=event.outputLimited?'输出超过上限，已截断':captured.expected===''?'运行完成（未设置期望输出）':matches?'样例通过':'输出与期望不一致';
        $('result').dataset.state=!event.outputLimited&&captured.expected!==''&&matches?'success':'';
      }
    });
    if(runId===id)runId=null;
    if(!await store.getMeta(`deleted:${captured.problemId}`))await store.putRecord({kind:'run',id,problemId:captured.problemId,language:captured.language,payload:{code:captured.code,stdin:captured.stdin,expected:captured.expected,stdout:runOutput,stderr:runError,error:result.text||'',status:result.cancelled?'cancelled':result.kind==='error'?'error':result.outputLimited?'output_limit':captured.expected!==''?(runOutput.replace(/\r\n/g,'\n').trimEnd()===captured.expected.replace(/\r\n/g,'\n').trimEnd()?'self_pass':'self_fail'):'complete',createdAt:clock().getTime()}});
    if(epoch===runEpoch&&runHistoryOpen)await showRunHistory();
  }
  async function showConflicts(){
    let dialog=$('conflicts-dialog');
    if(!dialog){dialog=document.createElement('dialog');dialog.id='conflicts-dialog';root.append(dialog);}
    const conflicts=await store.syncConflicts();
    dialog.innerHTML=`<div class="dialog-title"><h2>同步冲突 · 保留双方</h2>${button('close-conflicts','关闭')}</div><p>在选择之前，两个版本都会保留。另存为新题会保留本地题面与历史，原题采用云端版本；云端已删除的原题不会复活。</p>${conflicts.map(c=>`<section><h3>${escape(c.local.kind)} · ${escape(c.local.id)}</h3><div class="compare"><pre>${escape(c.local.payload?.code??JSON.stringify(c.local.payload,null,2))}</pre><pre>${escape(c.remote?.deleted?'云端已彻底删除':c.remote?.payload?.code??JSON.stringify(c.remote?.payload,null,2))}</pre></div><div class="actions">${c.remote?.deleted?'':button('keep-local','保留本地','',c.key)}${button('keep-cloud','保留云端','',c.key)}${c.local.kind==='problem'||c.local.problemId?button('copy-conflict','另存为新题','primary',c.key):''}${button('export-conflict','导出双方内容','',c.key)}</div></section>`).join('')||'<p>当前没有冲突。</p>'}`;
    if(!dialog.open)dialog.showModal();
  }
  function downloadJSON(value,name){const url=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)],{type:'application/json'}));const link=document.createElement('a');link.href=url;link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  async function showBackupConflicts(){
    let dialog=$('backup-conflicts-dialog');if(!dialog){dialog=document.createElement('dialog');dialog.id='backup-conflicts-dialog';root.append(dialog);}
    const pending=await store.getMeta('backup:pending')||[];
    dialog.innerHTML=`<div class="dialog-title"><h2>备份与合并冲突</h2>${button('close-backup-conflicts','关闭')}</div><p>现有记录保持原样。待处理版本保存在此设备，并随完整备份导出；题目可连同历史另存为新题。偏好设置冲突可先导出查看。</p>${pending.map(entry=>`<section class="glass"><h3>${escape(new Date(entry.createdAt).toLocaleString())} · ${entry.conflicts.length} 项冲突</h3>${entry.conflicts.map(c=>{const r=entry.backup.records.find(r=>r.kind===c.kind&&r.id===c.id);return `<p>${escape(r?.kind==='problem'?r.payload.title:r?.kind==='draft'?r.payload.code:c.kind+' · '+c.id)}</p>`;}).join('')}<div class="actions">${entry.conflicts.some(c=>entry.backup.records.some(r=>r.kind===c.kind&&r.id===c.id&&(r.kind==='problem'||r.problemId)))?button('copy-backup-conflict','题目另存为副本','primary',entry.id):''}${button('export-backup-conflict','导出待处理版本','',entry.id)}</div></section>`).join('')||'<p>当前没有待处理的恢复冲突。</p>'}`;
    if(!dialog.open)dialog.showModal();
  }
  async function previewBackupFile(file){
    pendingBackup=null;
    const backup=normalizeBackup(JSON.parse(await file.text()));
    const preview=await store.previewBackup(backup);
    let dialog=$('backup-preview-dialog');if(!dialog){dialog=document.createElement('dialog');dialog.id='backup-preview-dialog';root.append(dialog);dialog.addEventListener('close',()=>{pendingBackup=null;});}
    const labels={problem:'题目',draft:'草稿',attempt:'重写快照',run:'自测记录',review:'复习安排',plan:'每日计划',progress:'进度',settings:'偏好设置',conversation:'AI 对话'};
    dialog.innerHTML=`<h2>确认恢复备份</h2><p>${escape(file.name)}</p><p>${Object.entries(preview.counts).map(([kind,count])=>`${escape(labels[kind]||kind)} ${count} 条`).join(' · ')}</p><p>将新增 ${preview.imported} 条，已有相同记录 ${preview.skipped} 条，冲突 ${preview.conflicts.length} 条。${preview.pendingRestores?`另有 ${preview.pendingRestores} 组待处理恢复。`:''}</p><p class="muted">确认后合并到当前练习空间。已有不同版本保留，不会被覆盖；确认时会重新检查最新记录。</p><p id="backup-preview-error" role="status"></p><footer>${button('cancel-backup','取消')}${button('confirm-backup','确认合并','primary')}</footer>`;
    pendingBackup=backup;dialog.showModal();
  }
  let deleting=null;
  root.addEventListener('click',async event=>{
    const target=event.target.closest('[data-action]');if(!target)return;
    const action=target.dataset.action,id=target.dataset.id;
    try{
      if(action==='handoff'){await saveEditor();const backup=await store.exportBackup();const records=backup.records.filter(r=>r.kind==='problem'&&r.id===selected||r.problemId===selected);await client.handoff(records);toast('已打开接续目标，请在那里确认导入。');}
      if(action==='sync'){await account.sync();await refresh();await render();}
      if(action==='merge-guest'){const result=await account.mergeGuest();toast(`合并 ${result.imported} 条，保留冲突 ${result.conflicts.length} 条。`);await refresh();await render();}
      if(action==='connect-account'){target.disabled=true;try{await account.connect(!!$('remember-device')?.checked);}finally{target.disabled=false;}}
      if(action==='cloud-usage'){
        const {usage,limits,resetAt}=await account.usage();toast(`云端 ${usage.problems} / ${limits.problems} 题（含归档），${(usage.bytes/1048576).toFixed(2)} / ${(limits.userBytes/1048576).toFixed(2)} MiB；今日新增自测 ${usage.dailyRuns} / ${limits.dailyRuns} 次，${new Date(resetAt).toLocaleString()} 恢复额度。达到上限时本机保存和导出仍可用。`);
      }
      if(action==='delete-account'){
        let dialog=$('account-delete-dialog');if(!dialog){dialog=document.createElement('dialog');dialog.id='account-delete-dialog';root.append(dialog);}
        dialog.innerHTML=`<h2>删除云端账号数据？</h2><p>将彻底删除该账号的云端题目、代码、历史、对话、复习安排和所有设备连接，无法撤销。网站本机账号副本仍保留；离线设备上的副本需在对应设备自行清除。请先导出完整备份。</p><label>输入 DELETE 确认<input id="account-delete-confirm" autocomplete="off"></label><footer>${button('cancel-account-delete','取消')}${button('confirm-account-delete','彻底删除云端数据','danger')}</footer>`;dialog.showModal();
      }
      if(action==='cancel-account-delete')$('account-delete-dialog').close();
      if(action==='confirm-account-delete'){if($('account-delete-confirm').value!=='DELETE')throw new Error('请输入 DELETE 确认。');target.disabled=true;try{await store.flush();await account.deleteCloud();}catch(error){target.disabled=false;throw error;}}
      if(action==='devices'){
        let dialog=$('devices-dialog');if(!dialog){dialog=document.createElement('dialog');dialog.id='devices-dialog';root.append(dialog);}
        const devices=await account.devices();dialog.innerHTML=`<h2>已连接的设备</h2><p class="muted">撤销后该设备停止云端同步，本机草稿仍保留。</p>${devices.map(d=>`<div class="setting-row"><span>${escape(d.name)}<small>${escape(new Date(d.created_at*1000).toLocaleString())}</small></span>${button('revoke-device','撤销连接','danger',d.id)}</div>`).join('')||'<p>暂无设备连接。</p>'}${button('close-devices','关闭')}`;dialog.showModal();
      }
      if(action==='revoke-device'){await account.revoke(id);target.disabled=true;target.textContent='已撤销';}
      if(action==='close-devices')$('devices-dialog').close();
      if(action==='logout')await account.logout();
      if(action==='conflicts')await showConflicts();
      if(action==='close-conflicts')$('conflicts-dialog').close();
      if(action==='backup-conflicts')await showBackupConflicts();
      if(action==='cancel-backup')$('backup-preview-dialog').close();
      if(action==='confirm-backup'){
        const backup=pendingBackup;if(!backup)throw new Error('请重新选择备份文件。');
        target.disabled=true;
        try{const result=await store.restoreBackup(backup,{mode:'merge'});$('backup-preview-dialog').close();await refresh();toast(`恢复 ${result.imported} 条，已有 ${result.skipped} 条，冲突 ${result.conflicts.length} 条（未覆盖）。`);if(result.conflicts.length)await showBackupConflicts();}
        catch(error){$('backup-preview-error').textContent=error.message;throw error;}
        finally{target.disabled=false;}
      }
      if(action==='close-backup-conflicts')$('backup-conflicts-dialog').close();
      if(action==='copy-backup-conflict'){target.disabled=true;try{const result=await store.backupCopyConflict(id);await refresh();await showBackupConflicts();toast(`已另存 ${result.problemIds.length} 道题，原题与历史保留。`);}finally{target.disabled=false;}}
      if(action==='export-backup-conflict'){const entry=(await store.getMeta('backup:pending')||[]).find(p=>p.id===id);if(entry)downloadJSON(entry.backup,'acmcoder-pending-restore.json');}
      if(action==='keep-local'||action==='keep-cloud'){await store.syncResolve(id,action==='keep-local'?'local':'cloud');await account.sync();await showConflicts();}
      if(action==='copy-conflict'){target.disabled=true;try{const result=await store.syncCopyConflict(id);await account.sync();$('conflicts-dialog').close();await refresh();await navigate('practice',result.problemId);toast('已另存为新题，原题和两份内容均已保留。');}catch(error){target.disabled=false;throw error;}}
      if(action==='export-conflict'){
        const item=(await store.syncConflicts()).find(c=>c.key===id);const url=URL.createObjectURL(new Blob([JSON.stringify(item,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='acmcoder-conflict.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
      }
      if(action.startsWith('nav-'))return await navigate(action.slice(4));
      if(action==='practice')return await navigate('practice',id);
      if(action==='theme'){settings.theme=settings.theme==='dark'?'light':'dark';document.documentElement.dataset.theme=settings.theme;await store.putRecord({kind:'settings',id:'preferences',payload:settings});if(view==='settings')await render();}
      if(action.startsWith('filter-')){filter=action.slice(7);await render();}
      if(action==='open-import'){importKind='manual';importCases=[];$('import-note').textContent='';$('import-dialog').showModal();}
      if(action==='recommend-import'){importKind='unverified-link';importCases=[];$('import-stdin').value='';$('import-expected').value='';const item=catalog.find(p=>p.leetcodeSlug===id);$('import-url').value=item.leetcodeUrl;$('import-title').value=item.title;$('import-statement').value='';$('import-samples').value='';$('import-note').textContent='点击“读取公开题面”，或粘贴原题题面与样例。';$('import-dialog').showModal();}
      if(action==='close-import')$('import-dialog').close();
      if(action==='find-problems'){
        const finderEpoch=navigation;target.disabled=true;$('finder-status').textContent='正在查找…';findText=$('problem-request').value;
        try{await store.setMeta('problem-request',findText);const result=await resolveProblemRequest({text:findText,catalog,problems,aiClient:ai?ai.findProblems:undefined});candidates=result.candidates;
          if(view!=='library'||navigation!==finderEpoch||!$('finder-candidates'))return;
          $('finder-status').textContent=candidates.length?'选择一项查看题面和样例。':'没有找到候选；可换个描述、填写原题链接，或从插件捕获。';
          $('finder-candidates').innerHTML=candidates.map((c,i)=>`<div class="setting-row"><span><strong>${escape(c.title)}</strong><small>${c.existingId?'已保存，保留现有代码':c.sourceKind==='ai-original'?'AI 原创 · 模型生成样例':'未验证 · '+escape(c.sourceUrl||'仅有题名')}</small></span>${button('candidate-preview',c.existingId?'继续练习':'预览导入','',String(i))}</div>`).join('');
        }catch(error){if($('finder-status'))$('finder-status').textContent=error.message;}finally{target.disabled=false;}
      }
      if(action==='candidate-preview'){
        const candidate=candidates[Number(id)];if(!candidate)throw new Error('候选已过期，请重新查找。');
        if(candidate.existingId)return await navigate('practice',candidate.existingId);
        target.disabled=true;try{fillImport(await verifyProblemCandidate(candidate,{fetch:fetchSource}));}finally{target.disabled=false;}
      }
      if(action==='fetch-import'){
        $('import-note').textContent='正在读取公开题面…';
        const candidate=await verifyProblemCandidate({title:$('import-title').value,sourceUrl:$('import-url').value,sourceKind:'unverified-link'},{fetch:fetchSource});
        if(candidate.warning){$('import-note').textContent=`${candidate.warning}；可从插件捕获或粘贴题面和样例，填写内容会保留。`;return;}
        importKind='verified-source';importCases=candidate.cases||[];$('import-title').value=candidate.title;$('import-statement').value=candidate.statement;$('import-samples').value=(candidate.rawSamples||[]).join('\n\n');$('import-note').textContent='已读取真实题面与原始样例，请确认后导入。';
      }
      if(action==='save-import'){
        if(importKind==='unverified-link'&&!$('import-statement').value.trim())throw new Error('原题尚未读取；请粘贴真实题面，或使用插件捕获。');
        if(importKind==='ai-original'&&$('import-url').value.trim())throw new Error('AI 原创题不能冒充原平台来源。');
        const payload=normalizeProblem({title:$('import-title').value,statement:$('import-statement').value,sourceUrl:$('import-url').value.trim(),sourceKind:importKind==='unverified-link'?'manual':importKind,rawSamples:$('import-samples').value?[$('import-samples').value]:[],cases:$('import-stdin').value||$('import-expected').value?[{stdin:$('import-stdin').value,expected:$('import-expected').value},...importCases.slice(1)]:[]});
        const duplicate=payload.sourceUrl&&problems.find(p=>p.payload.sourceUrl===payload.sourceUrl);
        if(duplicate){$('import-dialog').close();await navigate('practice',duplicate.id);toast('这道题已在题库中，已保留现有代码。');return;}
        const nextId=crypto.randomUUID();await store.putRecord({kind:'problem',id:nextId,payload});$('import-dialog').close();await navigate('practice',nextId);
      }
      if(action==='run')await run();
      if(action==='run-all')await runAll();
      if(['case-add','case-update','case-delete'].includes(action))await saveCase(action);
      if(action==='runs'){historyFilters={problemId:selected,language,day:''};runHistoryPage=1;await showRunHistory();$('run-history')?.scrollIntoView({block:'nearest'});}
      if(action==='runs-prev'||action==='runs-next'){runHistoryPage=Math.max(1,runHistoryPage+(action==='runs-next'?1:-1));await showRunHistory();}
      if(action==='runs-clear'){historyFilters={problemId:'',language:'',day:''};runHistoryPage=1;await showRunHistory();}
      if(action==='stop'){cancelRun();$('result-label').textContent='已停止';$('result').dataset.state='';}
      if(action==='rewrite'){await saveEditor();draft=await store.startRewrite({problemId:selected,language,template:templates[language]});cancelRun();await render();}
      if(action==='finish'){await saveEditor();draft=await store.finishRewrite({problemId:selected,language});cancelRun();await render();await compare();}
      if(action==='discard'){draft=await store.discardRewrite({problemId:selected,language});cancelRun();await render();toast('已放弃本次重写，原记录仍保留。');}
      if(action==='history'){await saveEditor();await compare();}
      if(action==='more-history')await compare($('history-version')?.value,true);
      if(action==='archive'){await store.archiveProblem(id);await refresh();await render();toast('已归档，记录完整保留。');}
      if(action==='restore'){await store.restoreProblem(id);await refresh();await render();}
      if(action==='delete'){
        const preview=await store.previewDeleteProblem(id),labels={problem:'题目',draft:'草稿',attempt:'重写快照',run:'自测记录',review:'复习安排',plan:'每日计划中的引用',progress:'进度',conversation:'AI 对话'};
        deleting=id;$('delete-scope').textContent=`${preview.title}：${Object.entries(preview.counts).map(([kind,count])=>`${labels[kind]||kind} ${count} 条`).join(' · ')}`;$('delete-dialog').showModal();
      }
      if(action==='cancel-delete')$('delete-dialog').close();
      if(action==='confirm-delete'){target.disabled=true;try{await store.deleteProblem(deleting,{confirmed:true});$('delete-dialog').close();await refresh();await render();}finally{target.disabled=false;}}
      if(action==='review'){await store.putRecord({kind:'review',id:`review-${selected}`,problemId:selected,payload:{dueDay:tomorrow(),completedAt:null}});toast(`已加入 ${tomorrow()} 的复习安排。`);}
      if(action==='complete-plan'){await completeDailyProblem({store,day:day(),problemId:id,now:clock().getTime()});await render();}
      if(action==='defer-plan'){await deferDailyProblem({store,day:day(),tomorrow:tomorrow(),problemId:id});await render();toast('已推迟到明天，今天不再补回这道题。');}
      if(action==='replace-plan'){await replaceDailyProblem({store,day:day(),problemId:id,count:settings.count,lastPractice,timezone:settings.timezone});await render();}
      if(action==='export'){downloadJSON(await store.exportBackup(),`acmcoder-${day()}.json`);toast('完整备份已导出。');}
    }catch(error){if($('import-dialog').open)$('import-note').textContent=error.message;else toast(error.message);}
  });
  root.addEventListener('input',event=>{
    if(event.target.id==='problem-request'){findText=event.target.value;store.setMeta('problem-request',findText).catch(error=>toast(error.message));}
    if(['code','stdin','expected'].includes(event.target.id))saveEditor().catch(error=>toast(error.message));
    if(event.target.id==='search'){query=event.target.value;$('library-rows').innerHTML=libraryRows();}
  });
  root.addEventListener('change',async event=>{
    try{
      if(event.target.id==='practice-language'){
        await saveEditor();cancelRun();selectedCase=-1;runHistoryOpen=false;
        language=event.target.value;if(!languages.includes(language))throw new Error('语言不可用');
        history=[];historyCursor=null;await persistLocation();await render();
      }
      if(event.target.id==='case-select'){
        await saveEditor();cancelRun();selectedCase=Number(event.target.value);
        const sample=problem().payload.cases?.[selectedCase];
        if(sample){$('stdin').value=sample.stdin;$('expected').value=sample.expected;await saveEditor();}
        resetResult();$('case-controls').innerHTML=renderCaseControls(problem().payload.cases||[],selectedCase);
      }
      if(event.target.id.startsWith('run-history-')){
        const key={'run-history-problem':'problemId','run-history-language':'language','run-history-day':'day'}[event.target.id];
        if(key){historyFilters[key]=event.target.value;runHistoryPage=1;await showRunHistory();}
      }
      if(event.target.id==='history-version')await compare(event.target.value);
      if(event.target.id==='daily-count'||event.target.id==='timezone'){
        if(event.target.id==='daily-count')settings.count=Number(event.target.value);else settings.timezone=event.target.value;
        await store.putRecord({kind:'settings',id:'preferences',payload:settings});await render();
      }
      if(event.target.id==='backup-file'&&event.target.files[0]){const file=event.target.files[0];event.target.value='';await previewBackupFile(file);}
    }catch(error){toast(error.message);}
  });
  const leaving=()=>{if(view==='practice')saveEditor().catch(()=>{});};
  window.addEventListener('pagehide',leaving);
  await render();
  // A delayed focus/pull must never replace an editor the user has started typing in.
  return {navigate,refreshStatus,async refreshFromCloud(){if(view==='practice')return;await refresh();if(view!=='practice')await render();},destroy(){window.removeEventListener('pagehide',leaving);cancelRun();editor?.destroy();layout?.destroy();ai?.destroy();runner.destroy?.();}};
}
