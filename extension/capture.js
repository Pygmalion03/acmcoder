import {normalizeProblem} from '../shared/import.js';
import {htmlToText,extractRawSamples} from '../shared/problem-text.js';
export function leetcodeProblemId(slug){
  if(slug.length<=75)return `lc-${slug}`;
  let hash=14695981039346656037n;for(const c of slug)hash=BigInt.asUintN(64,(hash^BigInt(c.charCodeAt(0)))*1099511628211n);
  return `lc-${slug.slice(0,50)}-${hash.toString(16)}`;
}
export function capturedProblem(page){
  const url=new URL(page?.url);
  const match=/^\/problems\/([a-z0-9]+(?:-[a-z0-9]+)*)\//.exec(url.pathname);
  if(!['https://leetcode.cn','https://leetcode.com'].includes(url.origin)||!match||page.slug!==match[1]||!page.content)throw new Error('题目捕获内容与当前链接不匹配。');
  return {kind:'problem',id:leetcodeProblemId(page.slug),payload:normalizeProblem({title:page.title,statement:page.content,sourceUrl:`${url.origin}/problems/${page.slug}/`,sourceKind:'leetcode',tags:page.tags||[],rawSamples:extractRawSamples(page.content),cases:[]})};
}
export async function captureCurrentProblem({tabs=chrome.tabs,scripting=chrome.scripting}={}){
  const [tab]=await tabs.query({active:true,currentWindow:true});
  if(!/^https:\/\/leetcode\.(cn|com)\/problems\/[a-z0-9-]+\//.test(tab?.url||''))throw new Error('请先打开 LeetCode 题目页，再点击读取。');
  let response;
  try{response=await tabs.sendMessage(tab.id,{type:'ACMCODER_CAPTURE'});}
  catch(error){
    if(!/Receiving end does not exist|Could not establish connection/.test(error.message))throw error;
    await scripting.executeScript({target:{tabId:tab.id},files:['content-script.js']});response=await tabs.sendMessage(tab.id,{type:'ACMCODER_CAPTURE'});
  }
  const current=await tabs.get(tab.id);
  if(current.url!==tab.url||response?.page?.url!==tab.url)throw new Error('读取期间页面已切题，请再次读取当前题目。');
  if(!response?.ok)throw new Error(response?.error||'无法读取题目，可使用题库中的手动导入。');
  return capturedProblem(response.page);
}
export async function fetchProblemUrl(value){
  const url=new URL(value),match=/^\/problems\/([a-z0-9]+(?:-[a-z0-9]+)*)\/?$/.exec(url.pathname);
  if(!['https://leetcode.cn','https://leetcode.com'].includes(url.origin)||!match||url.search)throw new Error('插件目前支持 LeetCode 题目链接。其他来源可以手动导入。');
  const response=await chrome.runtime.sendMessage({type:'ACMCODER_FETCH_QUESTION_DATA',slug:match[1],origin:url.origin});
  const q=response?.question,html=q?.translatedContent||q?.content;
  if(!response?.ok||!html)throw new Error('公开题面读取失败。请打开原题后点击“读取当前题目”，或粘贴题面。');
  const statement=htmlToText(html);
  const rawSamples=extractRawSamples(statement);
  return {title:q.translatedTitle||q.title,statement,rawSamples};
}
