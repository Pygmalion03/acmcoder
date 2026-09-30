import {normalizeProblem} from './import.js';
export function officialProblemUrl(value){
 let url;try{url=new URL(value);}catch{throw new Error('题目来源链接无效。');}
 if(url.protocol!=='https:'||!['leetcode.cn','leetcode.com'].includes(url.hostname)||url.username||url.password||url.port||url.search||url.hash||!/^\/problems\/[a-z0-9]+(?:-[a-z0-9]+)*\/?$/.test(url.pathname))throw new Error('题目来源只接受公开 LeetCode 题目链接。');
 url.pathname=url.pathname.replace(/\/?$/,'/');return url.href;
}
const query=text=>text.toLowerCase().replace(/(?:leetcode|力扣|请|帮我|我想要|我要|导入|找一道|找一题|找题|题目|一道|练习|关于|有关)/g,'').replace(/[\s，。!?！?]/g,'').trim();
export async function resolveProblemRequest({text,catalog=[],problems=[],aiClient}){
 if(typeof text!=='string'||!text.trim()||text.length>2000)throw new Error('请描述想找的题目（最多 2000 字）。');
 const input=text.trim(),url=input.match(/https?:\/\/\S+/)?.[0];
 if(url)return {candidates:[{title:'原题链接',sourceUrl:officialProblemUrl(url),sourceKind:'unverified-link'}]};
 const q=query(input),original=/原创|original/i.test(input);
 if(!original&&q){
  const entries=[...problems.filter(p=>!p.payload.archivedAt).map(p=>({title:p.payload.title,sourceUrl:p.payload.sourceUrl,tags:p.payload.tags||[],existingId:p.id})),...catalog.map(p=>({title:p.title,sourceUrl:p.leetcodeUrl,tags:p.tags||[]}))];
  const scored=entries.map(p=>({...p,score:p.title.toLowerCase()===q?100:p.title.toLowerCase().includes(q)?80:q.includes(p.title.toLowerCase())?70:p.tags.some(t=>q.includes(t.toLowerCase()))?20:0})).filter(p=>p.score>0).sort((a,b)=>b.score-a.score||Number(!!b.existingId)-Number(!!a.existingId));
  const seen=new Set(),candidates=[];
  for(const p of scored){const identity=p.sourceUrl||p.title;if(seen.has(identity))continue;seen.add(identity);candidates.push({...p,sourceKind:'unverified-link'});if(candidates.length===5)break;}
  if(candidates.length)return {candidates};
 }
 if(!aiClient)return {candidates:[]};
 const answer=await aiClient(input,{original});let parsed;
 try{parsed=JSON.parse(String(answer).trim().replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,''));}catch{throw new Error('AI 候选解析失败，输入已保留，请换个描述重试。');}
 if(!Array.isArray(parsed.candidates)||parsed.candidates.length>5)throw new Error('AI 候选解析失败。');
 return {candidates:parsed.candidates.map(p=>{
  if(!p||typeof p.title!=='string'||!p.title.trim()||p.title.length>160)throw new Error('AI 候选解析失败。');
  if(p.sourceKind==='ai-original'){
   if(!original)throw new Error('你未要求原创，不能把 AI 生成题冒充平台题。');
   if(typeof p.statement!=='string'||!p.statement.trim())throw new Error('AI 原创题缺少题面。');
   return normalizeProblem({title:p.title,statement:p.statement,sourceKind:'ai-original',sourceUrl:'',rawSamples:Array.isArray(p.rawSamples)?p.rawSamples:[],cases:Array.isArray(p.cases)?p.cases:[]});
  }
  return {title:p.title,sourceUrl:p.sourceUrl?officialProblemUrl(p.sourceUrl):'',sourceKind:'unverified-link'};
 })};
}
export async function verifyProblemCandidate(candidate,sourceAdapter){
 if(candidate.sourceKind==='ai-original'||candidate.existingId)return candidate;
 if(!candidate.sourceUrl)return {...candidate,warning:'只有题名，尚无可验证的原题链接。'};
 const url=officialProblemUrl(candidate.sourceUrl);
 try{
  const data=await sourceAdapter.fetch(url);
  if(!data?.statement?.trim()||!data.title?.trim())throw new Error('原平台未返回题面。');
  if(data.sourceUrl&&officialProblemUrl(data.sourceUrl)!==url)throw new Error('原平台返回了其他来源。');
  return normalizeProblem({title:data.title,statement:data.statement,rawSamples:data.rawSamples||[],cases:data.cases||[],sourceUrl:url,sourceKind:'verified-source'});
 }catch(error){return {...candidate,sourceKind:'unverified-link',warning:error.message};}
}
