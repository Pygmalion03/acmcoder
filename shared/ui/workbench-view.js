import {diffLines} from '../workbench.js';

const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const button=(action,label,cls='',id='',disabled=false)=>`<button type="button" class="${cls}" data-action="${action}"${id?` data-id="${escape(id)}"`:''}${disabled?' disabled':''}>${label}</button>`;
const languageName={python:'Python',cpp:'C++',java:'Java'};
export const runStatusLabel=status=>({self_pass:'样例通过',self_fail:'输出不匹配',complete:'运行完成',cancelled:'已停止',error:'运行错误',output_limit:'输出超限'}[status]||'旧版记录');

export function renderDiff(before,after){
  const diff=diffLines(before,after);
  return `${diff.coarse?'<p class="muted">改动区间较大，按整段展示删除与新增；全部代码仍保留。</p>':''}<div class="diff-view" role="region" aria-label="逐行差异" tabindex="0">${diff.lines.map(line=>`<div class="diff-line" data-kind="${line.type==='same'?'context':line.type}"><span class="diff-line-number">${line.beforeLine??''}</span><span class="diff-line-number">${line.afterLine??''}</span><span aria-label="${line.type==='added'?'新增':line.type==='removed'?'删除':'相同'}">${line.type==='added'?'+':line.type==='removed'?'−':' '}</span><code>${escape(line.text)||' '}</code></div>`).join('')||'<p class="muted">两个版本均为空。</p>'}</div>`;
}

export function renderCaseControls(cases,selectedCase){
  return `<div class="case-toolbar"><label>自测样例<select id="case-select"><option value="-1" ${selectedCase<0?'selected':''}>当前输入（自定义）</option>${cases.map((c,i)=>`<option value="${i}" ${i===selectedCase?'selected':''}>样例 ${i+1}</option>`).join('')}</select></label><div class="actions">${button('case-add','保存为新样例','quiet','',cases.length>=50)}${button('case-update','更新当前样例','quiet','',selectedCase<0)}${button('case-delete','移除当前样例','quiet','',selectedCase<0)}</div></div><p class="muted case-help">样例随题目保存，跨语言共用；原始题面样例保留。期望输出留空时只运行，不判定通过。</p>`;
}

export function renderCaseResults(results,total){
  if(!results.length)return '';
  const passed=results.filter(r=>r.status==='self_pass').length;
  return `<div class="case-results-summary" role="status">已完成 ${results.length} / ${total} 组 · 通过 ${passed} 组</div><p class="muted">本轮使用启动时的代码快照和已保存样例，当前草稿保持不变。</p>${results.map(r=>`<details class="case-card" ${r.status!=='self_pass'?'open':''}><summary>样例 ${r.caseIndex+1} · ${escape(runStatusLabel(r.status))}</summary><div class="test-grid"><section><strong>输入</strong><pre>${escape(r.stdin)}</pre></section><section><strong>期望输出</strong><pre>${escape(r.expected)}</pre></section><section><strong>实际输出</strong><pre>${escape(r.stdout)}</pre></section><section><strong>错误信息</strong><pre>${escape([r.error,r.stderr].filter(Boolean).join('\n')||'无')}</pre></section></div>${r.status==='self_fail'?renderDiff(r.expected,r.stdout):''}</details>`).join('')}`;
}

export function renderPractice({problem,draft,languages,language,progress,description,selectedCase=-1}){
  const p=problem.payload;
  return `<div class="practice-heading"><div><span class="eyebrow">当前练习 · ACM</span><h2>${escape(p.title)}</h2>${progress?`<p class="muted">${escape(progress)} · 记录已保留</p>`:''}</div><span id="save-status" class="save-state">已保存到此设备</span></div>
  <div id="practice-shell" class="practice-shell" data-panel="code">
    <div class="practice-tabs" role="tablist" aria-label="练习面板">${[['problem','题目'],['code','代码'],['result','样例与结果']].map(([id,label])=>`<button type="button" role="tab" aria-selected="${id==='code'}" aria-controls="${id}-panel" data-action="practice-panel" data-panel="${id}" data-id="${id}">${label}</button>`).join('')}</div>
    <div id="practice-workspace" class="workspace">
      <section id="problem-panel" class="glass problem-panel" data-practice-panel="problem"><div class="panel-head"><strong>题目</strong><span class="tag">完整程序</span></div><div class="statement-body">${escape(p.statement||'暂无题面，请参考原题链接。')}${p.sourceUrl?`<a class="source-url" href="${escape(p.sourceUrl)}" target="_blank" rel="noopener noreferrer">查看原题 ↗</a>`:''}${p.rawSamples?.length?`<h3>原始样例</h3><pre>${escape(p.rawSamples.join('\n\n'))}</pre>`:''}<p class="muted">编写完整程序，自行处理标准输入输出。</p></div></section>
      <button type="button" id="workspace-splitter" class="workspace-splitter" role="separator" aria-orientation="vertical" aria-label="调整题面宽度" aria-valuemin="22" aria-valuemax="58" aria-valuenow="32"></button>
      <section class="glass editor-panel">
        <div class="panel-head"><label>语言 <select id="practice-language" aria-label="编程语言">${languages.map(l=>`<option value="${l}" ${l===language?'selected':''}>${languageName[l]}</option>`).join('')}</select></label><div class="editor-tools">${button('runs','运行记录','quiet')}${button('history','历史对照','quiet')}${button('rewrite','↻ 重新手撕','quiet')}</div></div>
        ${draft.mode==='rewrite'?`<div class="rewrite-note"><span>原代码已保留，先独立完成这次重写。</span>${button('discard','放弃本次重写','quiet')}${button('finish','结束并对照','')}</div>`:''}
        <div id="code-panel" data-practice-panel="code"><textarea id="code" class="code-editor" aria-label="代码" spellcheck="false" autocapitalize="off">${escape(draft.code)}</textarea><span id="editor-status" class="editor-status">正在准备编辑器…</span></div>
        <div id="result-panel" class="result-panel" data-practice-panel="result"><div id="case-controls">${renderCaseControls(p.cases||[],selectedCase)}</div><div class="test-grid"><label>标准输入 stdin<textarea id="stdin" spellcheck="false">${escape(draft.stdin)}</textarea></label><label>期望输出（可留空）<textarea id="expected" spellcheck="false">${escape(draft.expected)}</textarea></label></div><div id="result" class="result"><span id="result-label" role="status">运行后在这里查看结果</span><pre id="stdout"></pre><pre id="stderr"></pre></div><div id="case-results" class="case-results"></div></div>
      </section>
    </div>
    <div class="editor-footer"><span class="muted">${escape(description||'浏览器内运行 · 最长 5 秒')}</span><div>${button('stop','停止','quiet')}<button type="button" id="run-all" class="quiet" data-action="run-all" ${!p.cases?.length?'disabled':''}>运行全部样例</button>${button('run','▷ 运行自测','primary')}</div></div>
  </div><div id="comparison"></div><div id="run-history"></div>`;
}

export function renderRunHistory({page,problems,languages,filters,timeZone}){
  const titles=new Map(problems.map(p=>[p.id,p.payload.title]));
  const date=value=>Number.isFinite(value)?new Intl.DateTimeFormat('zh-CN',{timeZone,dateStyle:'short',timeStyle:'medium'}).format(value):'时间未记录';
  return `<section class="glass history-panel"><div class="section-heading"><h2>运行记录</h2><span class="muted">共 ${page.total} 条 · 保留当时的代码、输入和结果</span></div><div class="history-toolbar"><label>题目<select id="run-history-problem"><option value="">全部题目</option>${problems.map(p=>`<option value="${escape(p.id)}" ${filters.problemId===p.id?'selected':''}>${escape(p.payload.title)}</option>`).join('')}</select></label><label>语言<select id="run-history-language"><option value="">全部语言</option>${languages.map(l=>`<option value="${l}" ${filters.language===l?'selected':''}>${languageName[l]}</option>`).join('')}</select></label><label>练习日期<input id="run-history-day" type="date" value="${escape(filters.day)}"></label>${button('runs-clear','清除筛选','quiet')}</div><div class="history-list">${page.items.map(record=>{
    const r=record.payload;
    return `<details class="history-entry"><summary><strong>${escape(titles.get(record.problemId)||record.problemId)}</strong> · ${escape(languageName[record.language]||record.language||'未知语言')} · ${escape(runStatusLabel(r.status))}<small>${escape(date(r.createdAt??record.updatedAt))}${r.batchId?` · 批次样例 ${Number(r.caseIndex)+1}`:''}</small></summary>${typeof r.code==='string'?`<h3>代码快照</h3><pre>${escape(r.code)}</pre>`:'<p class="muted">这条旧记录没有保存代码快照。</p>'}<div class="test-grid"><section><strong>输入</strong><pre>${escape(r.stdin)}</pre></section><section><strong>期望输出</strong><pre>${escape(r.expected)}</pre></section><section><strong>实际输出</strong><pre>${escape(r.stdout)}</pre></section><section><strong>错误信息</strong><pre>${escape([r.error,r.stderr].filter(Boolean).join('\n')||'无')}</pre></section></div></details>`;
  }).join('')||'<p class="empty">没有符合条件的运行记录。</p>'}</div><div class="history-toolbar">${button('runs-prev','上一页','quiet','',page.page<=1)}<span>第 ${page.page} / ${Math.max(1,page.pageCount)} 页</span>${button('runs-next','下一页','quiet','',page.page>=page.pageCount)}</div></section>`;
}
