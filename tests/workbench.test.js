import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeCases,runCaseBatch,queryRunHistory,diffLines} from '../shared/workbench.js';

test('samples preserve whitespace, copy their inputs, and keep the existing 50-case limit',()=>{
  const input=[{stdin:'中文\n\n',expected:'\n',unused:true}],copy=normalizeCases(input);
  assert.deepEqual(copy,[{stdin:'中文\n\n',expected:'\n'}]);
  copy[0].stdin='changed';assert.equal(input[0].stdin,'中文\n\n');
  assert.equal(normalizeCases(Array.from({length:50},()=>({stdin:'',expected:''}))).length,50);
  assert.throws(()=>normalizeCases(Array.from({length:51},()=>({stdin:'',expected:''}))),/50/);
  assert.throws(()=>normalizeCases([{stdin:1,expected:''}]),/文本/);
});

test('batch runs an immutable code/sample snapshot, separates results, and ignores late events',async()=>{
  const draft={code:'original',stdin:'editor input',expected:'editor expectation'};
  const cases=[{stdin:'first',expected:'中文\n'},{stdin:'second',expected:'wanted'},{stdin:'third',expected:''}];
  const inputs=[],events=[],persisted=[];let previousEmit;
  const runner={async run(input,emit){
    inputs.push({...input});
    if(inputs.length===1){
      draft.code='edited while running';cases[1].stdin='edited case';
      emit({type:'stdout',id:input.id,text:'中文\r\n'});previousEmit=emit;
    }else if(inputs.length===2){
      previousEmit({type:'stdout',id:inputs[0].id,text:'late'});
      emit({type:'stdout',id:'another-run',text:'wrong id'});
      emit({type:'stdout',id:input.id,text:'different'});
      emit({type:'stderr',id:input.id,text:'diagnostic'});
    }else emit({type:'stdout',id:input.id,text:'unasserted'});
    return {kind:'complete'};
  },cancel(){assert.fail('no cancellation expected');}};
  const batch=await runCaseBatch({runner,language:'python',code:draft.code,cases,batchId:'batch',clock:()=>123,onEvent:event=>events.push(event),onResult:async record=>persisted.push(record)});
  assert.deepEqual(inputs.map(input=>[input.code,input.stdin]),[['original','first'],['original','second'],['original','third']]);
  assert.deepEqual(batch.results.map(result=>result.status),['self_pass','self_fail','complete']);
  assert.equal(batch.results[1].stderr,'diagnostic');
  assert.equal(batch.results[0].stdout,'中文\r\n');
  assert.equal(events.some(event=>event.text==='late'||event.text==='wrong id'),false);
  assert.equal(batch.results[0].createdAt,123);
  assert.equal(batch.results[1].caseIndex,1);
  assert.equal(batch.results[0].batchId,'batch');
  assert.equal(new Set(batch.results.map(result=>result.id)).size,3);
  assert.equal(batch.total,3);assert.equal(batch.cancelled,false);
  assert.equal(persisted.length,3);
  assert.deepEqual(draft,{code:'edited while running',stdin:'editor input',expected:'editor expectation'});
});

test('individual runner failures and limited output remain explicit results',async()=>{
  let index=0;
  const runner={async run(){index++;if(index===1)throw new Error('runtime failed');return {kind:'error',outputLimited:true,text:'output exceeded'};},cancel(){}};
  const result=await runCaseBatch({runner,language:'cpp',code:'code',cases:[{stdin:'',expected:'1'},{stdin:'',expected:'2'}]});
  assert.deepEqual(result.results.map(item=>item.status),['error','output_limit']);
  assert.equal(result.results[0].error,'runtime failed');
  assert.equal(result.results[1].error,'output exceeded');
});

test('cancelling a batch stops its active case and never launches the next case',async()=>{
  const controller=new AbortController(),started=[],stopped=[];let finish;
  const runner={run(input){started.push(input.id);queueMicrotask(()=>controller.abort());return new Promise(resolve=>{finish=resolve;});},cancel(id){stopped.push(id);finish({kind:'error',cancelled:true,text:'stopped'});}};
  const batch=await runCaseBatch({runner,language:'python',code:'code',cases:[{stdin:'',expected:''},{stdin:'next',expected:''}],signal:controller.signal});
  assert.deepEqual(stopped,started);assert.equal(started.length,1);
  assert.equal(batch.cancelled,true);assert.equal(batch.results[0].status,'cancelled');
  assert.equal(batch.total,2);assert.equal(batch.results.length,1);
});

test('an already cancelled batch does not start or save any case',async()=>{
  const runner={run(){assert.fail('must not run');},cancel(){assert.fail('must not cancel an absent run');}};
  const batch=await runCaseBatch({runner,language:'python',code:'code',cases:[{stdin:'',expected:''}],signal:AbortSignal.abort(),onResult(){assert.fail('must not save');}});
  assert.equal(batch.cancelled,true);assert.deepEqual(batch.results,[]);
});

test('cancellation at the case-start callback does not enter the runner',async()=>{
  const controller=new AbortController();let runs=0;
  const batch=await runCaseBatch({runner:{run(){runs++;},cancel(){}},language:'python',code:'code',cases:[{stdin:'',expected:''}],signal:controller.signal,onEvent(){controller.abort();}});
  assert.equal(runs,0);assert.equal(batch.cancelled,true);assert.equal(batch.results.length,0);
});

test('failure to save a result stops the batch before any subsequent case',async()=>{
  let runs=0;
  await assert.rejects(runCaseBatch({runner:{async run(){runs++;return {kind:'complete'};},cancel(){}},language:'python',code:'code',cases:[{stdin:'',expected:''},{stdin:'next',expected:''}],onResult:async()=>{throw new Error('storage full');}}),/storage full/);
  assert.equal(runs,1);
});

test('cancellation while persisting a completed case preserves it and stops the next case',async()=>{
  const controller=new AbortController();let runs=0;
  const result=await runCaseBatch({runner:{async run(){runs++;return {kind:'complete'};},cancel(){assert.fail('completed run must not be cancelled');}},language:'python',code:'code',cases:[{stdin:'',expected:''},{stdin:'next',expected:''}],signal:controller.signal,onResult:async()=>controller.abort()});
  assert.equal(result.results[0].status,'complete');assert.equal(result.cancelled,true);assert.equal(runs,1);
});

const run=(id,createdAt,problemId='p',language='python')=>({kind:'run',id,problemId,language,payload:{code:'code',stdin:'input',expected:'expected',stdout:'actual',stderr:'diagnostic',status:'self_fail',createdAt}});

test('history filters the user calendar day, problem, language and preserves complete records',()=>{
  const records=[run('a',Date.parse('2026-10-12T15:59:59Z')),run('b',Date.parse('2026-10-12T16:00:00Z')),run('c',Date.parse('2026-10-13T15:59:59Z')),run('d',Date.parse('2026-10-13T16:00:00Z')),run('other',Date.parse('2026-10-13T00:00:00Z'),'other'),run('java',Date.parse('2026-10-13T00:00:00Z'),'p','java'),{kind:'problem',id:'p',payload:{}}];
  const before=structuredClone(records);
  const result=queryRunHistory(records,{problemId:'p',language:'python',day:'2026-10-13',timeZone:'Asia/Shanghai'});
  assert.deepEqual(result.items.map(item=>item.id),['c','b']);
  assert.equal(result.items[1],records[1]);
  assert.equal(result.items[0].payload.code,'code');
  assert.deepEqual(records,before);
  const utc=queryRunHistory(records,{problemId:'p',language:'python',day:'2026-10-13',timeZone:'UTC'});
  assert.deepEqual(utc.items.map(item=>item.id),['d','c']);
});

test('history pagination is stable for equal timestamps and clamps pages after deletion',()=>{
  const records=[run('a',1),run('c',1),run('b',1),run('d',2)];
  const first=queryRunHistory(records,{page:1,pageSize:2}),second=queryRunHistory(records,{page:2,pageSize:2});
  assert.deepEqual(first.items.map(item=>item.id),['d','c']);
  assert.deepEqual(second.items.map(item=>item.id),['b','a']);
  assert.equal(first.total,4);assert.equal(first.pageCount,2);
  assert.equal(queryRunHistory(records,{page:99,pageSize:2}).page,2);
  assert.deepEqual(queryRunHistory([]),{items:[],total:0,page:1,pageSize:10,pageCount:1});
  assert.throws(()=>queryRunHistory(records,{pageSize:0}),/分页/);
});

test('legacy run timestamps fall back to the record timestamp',()=>{
  const record=run('old',undefined);record.updatedAt=Date.parse('2026-10-13T00:00:00Z');
  assert.equal(queryRunHistory([record],{day:'2026-10-13',timeZone:'UTC'}).total,1);
});

test('line differences preserve Chinese, blank lines, source text and both line numbers',()=>{
  const result=diffLines('开头\n\n旧代码\n结尾','开头\n\n<script>新代码</script>\n结尾');
  assert.deepEqual(result.lines,[
    {type:'same',text:'开头',beforeLine:1,afterLine:1},
    {type:'same',text:'',beforeLine:2,afterLine:2},
    {type:'removed',text:'旧代码',beforeLine:3,afterLine:null},
    {type:'added',text:'<script>新代码</script>',beforeLine:null,afterLine:3},
    {type:'same',text:'结尾',beforeLine:4,afterLine:4},
  ]);
  assert.equal(result.coarse,false);assert.equal(result.truncated,false);
});

test('line differences handle empty sources, insertions and normalized line endings',()=>{
  assert.deepEqual(diffLines('','').lines,[]);
  assert.deepEqual(diffLines('','新').lines,[{type:'added',text:'新',beforeLine:null,afterLine:1}]);
  assert.deepEqual(diffLines('旧','').lines,[{type:'removed',text:'旧',beforeLine:1,afterLine:null}]);
  assert.deepEqual(diffLines('a\r\n\r\nb\r','a\n\nb\n').lines.map(line=>line.type),['same','same','same','same']);
  const inserted=diffLines('first\nlast','first\nnew\nlast');
  assert.deepEqual(inserted.lines.at(-1),{type:'same',text:'last',beforeLine:2,afterLine:3});
});

test('exact line alignment finds unchanged interior lines among replacements',()=>{
  const result=diffLines('old\nkeep\nend','new\nkeep\nfinish');
  assert.deepEqual(result.lines.map(line=>[line.type,line.text]),[['removed','old'],['added','new'],['same','keep'],['removed','end'],['added','finish']]);
  assert.equal(result.coarse,false);
});

test('large replacements use bounded alignment while preserving every source line',()=>{
  const before=['prefix',...Array.from({length:1000},(_,i)=>`old ${i}`),'suffix'].join('\n');
  const after=['prefix',...Array.from({length:1000},(_,i)=>`new ${i}`),'suffix'].join('\n');
  const result=diffLines(before,after);
  assert.equal(result.coarse,true);assert.equal(result.truncated,false);
  assert.equal(result.lines.filter(line=>line.type!=='added').map(line=>line.text).join('\n'),before);
  assert.equal(result.lines.filter(line=>line.type!=='removed').map(line=>line.text).join('\n'),after);
  assert.deepEqual(result.lines.at(-1),{type:'same',text:'suffix',beforeLine:1002,afterLine:1002});
});

test('large mostly identical sources retain exact alignment without a large matrix',()=>{
  const before=Array.from({length:10000},(_,i)=>`line ${i}`),after=[...before];after[5000]='changed';
  const result=diffLines(before.join('\n'),after.join('\n'));
  assert.equal(result.coarse,false);assert.equal(result.lines.length,10001);
  assert.equal(result.lines.filter(line=>line.type==='removed').length,1);
  assert.equal(result.lines.filter(line=>line.type==='added').length,1);
});
