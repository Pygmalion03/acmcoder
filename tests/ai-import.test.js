import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveProblemRequest,verifyProblemCandidate} from '../shared/ai-import.js';
const url='https://leetcode.cn/problems/binary-search/';
const catalog=[{title:'二分查找',leetcodeUrl:url,tags:['数组','二分查找']}];
test('natural-language catalog matching works without AI and prefers saved problems',async()=>{
 const result=await resolveProblemRequest({text:'导入 LeetCode 二分查找',catalog});assert.equal(result.candidates[0].sourceUrl,url);assert.equal(result.candidates[0].sourceKind,'unverified-link');
 const saved=await resolveProblemRequest({text:'二分查找',catalog,problems:[{id:'saved',payload:{title:'二分查找',sourceUrl:url,tags:[]}}]});assert.equal(saved.candidates[0].existingId,'saved');
});
test('model URL and claimed source are unverified until actual source fetch succeeds',async()=>{
 const result=await resolveProblemRequest({text:'找未知题',aiClient:async()=>JSON.stringify({candidates:[{title:'模型题名',sourceUrl:url,sourceKind:'verified-source'}]})});assert.equal(result.candidates[0].sourceKind,'unverified-link');
 const verified=await verifyProblemCandidate(result.candidates[0],{fetch:async()=>({title:'官方题名',statement:'真实题面',rawSamples:['真实样例']})});assert.equal(verified.sourceKind,'verified-source');assert.equal(verified.title,'官方题名');assert.deepEqual(verified.rawSamples,['真实样例']);
 const failed=await verifyProblemCandidate(result.candidates[0],{fetch:async()=>{throw new Error('原平台拒绝');}});assert.equal(failed.sourceKind,'unverified-link');assert.match(failed.warning,/原平台拒绝/);assert.equal(failed.statement,undefined);
});
test('invented or malicious links never get fetched and malformed answers keep the user request',async()=>{
 for(const sourceUrl of ['javascript:alert(1)','https://evil.test/problems/a','https://user:pass@leetcode.cn/problems/a','https://leetcode.cn/problems/a?redirect=evil'])await assert.rejects(resolveProblemRequest({text:'找未知题',aiClient:async()=>JSON.stringify({candidates:[{title:'x',sourceUrl}]})}),/来源/);
 await assert.rejects(resolveProblemRequest({text:'不存在题',aiClient:async()=>'<not JSON>'}),/解析/);
 const missing=await resolveProblemRequest({text:'https://leetcode.cn/problems/not-existing/'});const failed=await verifyProblemCandidate(missing.candidates[0],{fetch:async()=>{throw new Error('找不到题目');}});assert.equal(failed.sourceKind,'unverified-link');
});
test('AI originals require explicit request and never inherit a platform source',async()=>{
 const aiClient=async()=>JSON.stringify({candidates:[{title:'原创求和',sourceKind:'ai-original',sourceUrl:url,statement:'读取整数求和',cases:[{stdin:'1 2',expected:'3'}]}]});
 await assert.rejects(resolveProblemRequest({text:'导入 LeetCode 某题',aiClient}),/原创/);
 const result=await resolveProblemRequest({text:'生成一道原创求和题',aiClient});assert.equal(result.candidates[0].sourceKind,'ai-original');assert.equal(result.candidates[0].sourceUrl,'');assert.deepEqual(result.candidates[0].cases,[{stdin:'1 2',expected:'3'}]);
});
