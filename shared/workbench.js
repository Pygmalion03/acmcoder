export function normalizeCases(cases) {
  if (!Array.isArray(cases) || cases.length > 50) throw new Error('样例最多保存 50 组。');
  return cases.map(item => {
    if (!item || typeof item.stdin !== 'string' || typeof item.expected !== 'string') throw new Error('每组样例需要文本格式的输入和期望输出。');
    return {stdin:item.stdin,expected:item.expected};
  });
}

const normalizeOutput = text => text.replace(/\r\n/g,'\n').trimEnd();

// No draft or store writes happen here. Callers capture the selected context and
// may persist each result through onResult before the next case starts.
export async function runCaseBatch({runner,language,code,cases,batchId=crypto.randomUUID(),signal,onEvent=()=>{},onResult=async()=>{},clock=()=>Date.now()}) {
  if (typeof code !== 'string') throw new Error('代码必须为文本。');
  const snapshot = normalizeCases(cases),results=[];
  let activeId=null,cancelled=!!signal?.aborted;
  const cancel=()=>{cancelled=true;if(activeId)runner.cancel(activeId);};
  signal?.addEventListener('abort',cancel,{once:true});
  try {
    for (let caseIndex=0;caseIndex<snapshot.length;caseIndex++) {
      if (cancelled || signal?.aborted) break;
      const {stdin,expected}=snapshot[caseIndex],id=crypto.randomUUID();
      let stdout='',stderr='',finished=false,result;
      activeId=id;
      onEvent({type:'case-start',id,batchId,caseIndex});
      if (cancelled || signal?.aborted) {activeId=null;break;}
      try {
        result=await runner.run({id,language,code,stdin,signal},event=>{
          if (finished || event.id && event.id!==id) return;
          const type=event.type||event.kind;
          if (type==='stdout') stdout+=event.text||'';
          if (type==='stderr') stderr+=event.text||'';
          onEvent({...event,type,id,batchId,caseIndex});
        });
      } catch (error) {
        result={kind:'error',text:String(error.message||error),cancelled:cancelled||!!signal?.aborted};
      } finally {
        finished=true;activeId=null;
      }
      cancelled=cancelled||!!result.cancelled||!!signal?.aborted;
      const status=cancelled?'cancelled':result.outputLimited?'output_limit':result.kind==='error'||result.type==='error'?'error':expected===''?'complete':normalizeOutput(stdout)===normalizeOutput(expected)?'self_pass':'self_fail';
      const record={id,batchId,caseIndex,language,code,stdin,expected,stdout,stderr,error:result.text||'',status,createdAt:clock()};
      results.push(record);
      // A persistence failure must reject this batch and prevent later cases.
      await onResult(record);
      if (cancelled) break;
    }
    return {batchId,results,total:snapshot.length,cancelled:cancelled||!!signal?.aborted};
  } finally {
    signal?.removeEventListener('abort',cancel);
  }
}

const runTimestamp = record => Number.isFinite(record.payload?.createdAt)?record.payload.createdAt:Number.isFinite(record.updatedAt)?record.updatedAt:0;

export function queryRunHistory(records,{problemId,language,day='',timeZone=Intl.DateTimeFormat().resolvedOptions().timeZone,page=1,pageSize=10}={}) {
  if (!Number.isSafeInteger(page) || page<1 || !Number.isSafeInteger(pageSize) || pageSize<1 || pageSize>100) throw new Error('运行历史分页参数无效。');
  const formatter=day?new Intl.DateTimeFormat('en',{timeZone,year:'numeric',month:'2-digit',day:'2-digit'}):null;
  const matchesDay=record=>{
    if (!formatter) return true;
    const parts=Object.fromEntries(formatter.formatToParts(new Date(runTimestamp(record))).map(part=>[part.type,part.value]));
    return `${parts.year}-${parts.month}-${parts.day}`===day;
  };
  const filtered=records.filter(record=>record.kind==='run'&&record.payload&&(!problemId||record.problemId===problemId)&&(!language||record.language===language)&&matchesDay(record));
  filtered.sort((a,b)=>runTimestamp(b)-runTimestamp(a)||b.id.localeCompare(a.id));
  const total=filtered.length,pageCount=Math.max(1,Math.ceil(total/pageSize));
  page=Math.min(page,pageCount);
  return {items:filtered.slice((page-1)*pageSize,page*pageSize),total,page,pageSize,pageCount};
}

const MAX_DIFF_CELLS=250000;
const sourceLines = text => text===''?[]:text.replace(/\r\n?/g,'\n').split('\n');

// Exact line LCS is limited to 250,000 cells (~1 MiB). Large changed middles
// become a complete removed/added block after retaining equal prefix/suffix.
// No source lines are dropped; coarse only describes the alignment precision.
export function diffLines(before,after) {
  const oldLines=sourceLines(before),newLines=sourceLines(after),lines=[];
  let prefix=0,suffix=0;
  while (prefix<oldLines.length&&prefix<newLines.length&&oldLines[prefix]===newLines[prefix]) prefix++;
  while (suffix<oldLines.length-prefix&&suffix<newLines.length-prefix&&oldLines[oldLines.length-1-suffix]===newLines[newLines.length-1-suffix]) suffix++;
  for (let i=0;i<prefix;i++) lines.push({type:'same',text:oldLines[i],beforeLine:i+1,afterLine:i+1});
  const oldCount=oldLines.length-prefix-suffix,newCount=newLines.length-prefix-suffix;
  const coarse=oldCount>0&&newCount>0&&(oldCount+1)*(newCount+1)>MAX_DIFF_CELLS;
  let oldIndex=0,newIndex=0;
  const removed=()=>{lines.push({type:'removed',text:oldLines[prefix+oldIndex],beforeLine:prefix+oldIndex+1,afterLine:null});oldIndex++;};
  const added=()=>{lines.push({type:'added',text:newLines[prefix+newIndex],beforeLine:null,afterLine:prefix+newIndex+1});newIndex++;};
  if (coarse || !oldCount || !newCount) {
    while (oldIndex<oldCount) removed();
    while (newIndex<newCount) added();
  } else {
    const width=newCount+1,lcs=new Uint32Array((oldCount+1)*width);
    for (let i=oldCount-1;i>=0;i--) for (let j=newCount-1;j>=0;j--) {
      lcs[i*width+j]=oldLines[prefix+i]===newLines[prefix+j]?lcs[(i+1)*width+j+1]+1:Math.max(lcs[(i+1)*width+j],lcs[i*width+j+1]);
    }
    while (oldIndex<oldCount&&newIndex<newCount) {
      if (oldLines[prefix+oldIndex]===newLines[prefix+newIndex]) {
        lines.push({type:'same',text:oldLines[prefix+oldIndex],beforeLine:prefix+oldIndex+1,afterLine:prefix+newIndex+1});oldIndex++;newIndex++;
      } else if (lcs[(oldIndex+1)*width+newIndex]>=lcs[oldIndex*width+newIndex+1]) removed();
      else added();
    }
    while (oldIndex<oldCount) removed();
    while (newIndex<newCount) added();
  }
  for (let i=0;i<suffix;i++) {
    const beforeLine=oldLines.length-suffix+i+1,afterLine=newLines.length-suffix+i+1;
    lines.push({type:'same',text:oldLines[beforeLine-1],beforeLine,afterLine});
  }
  return {lines,coarse,truncated:false};
}
