import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {htmlToText,extractRawSamples} from '../shared/problem-text.js';
import {capturedProblem} from '../extension/capture.js';

const html='<p>Length &lt;= 10<sup>4</sup>; a<sub>i</sub>.</p><p>Example 1:</p><pre>Input: nums = [2,7], target = 9<br>Output: [0,1]</pre><p>Example 2:</p><pre>Input: nums = [3,3], target = 6<br>Output: [0,1]</pre><p>Constraints:</p><ul><li>-10<sup>9</sup> &lt;= nums[i]</li></ul>';

test('question text retains exponent/subscript notation, block boundaries and all sample groups',()=>{
  const text=htmlToText(html);
  assert.match(text,/10\^4; a_i/);assert.match(text,/-10\^9/);
  const samples=extractRawSamples(text);assert.equal(samples.length,2);
  assert.match(samples[0],/\[2,7\]/);assert.match(samples[1],/\[3,3\]/);
  assert.ok(samples.every(s=>!s.includes('Constraints:')));
  assert.equal(extractRawSamples('题目\n示例 1：\n输入：1\n输出：2\n示例 2：\n输入：3\n输出：4\n提示：\nn < 10').length,2);
});

test('numeric entities decode once without throwing on invalid code points or exposing scripts',()=>{
  assert.equal(htmlToText('<script>secret()</script><p>&#x1f642; &#60; &amp;lt; &#99999999;</p>'),'🙂 < &lt; &#99999999;');
});

test('real content-script capture uses the shared text converter for GraphQL and DOM fallback',async()=>{
  const source=(await readFile(new URL('../extension/content-script.js',import.meta.url),'utf8')).replace(/^import[^\n]*\n/,'');
  for(const graphql of [true,false]){
    let listener;
    const question=graphql?{title:'Two Sum',difficulty:'Easy',content:html,topicTags:[{name:'Array'}]}:null;
    const context={htmlToText,window:{},location:{href:'https://leetcode.cn/problems/two-sum/',pathname:'/problems/two-sum/',origin:'https://leetcode.cn'},document:{title:'Two Sum - LeetCode',body:{innerText:'Easy',innerHTML:html},querySelector:selector=>selector==='[data-track-load="description_content"]'?{innerHTML:html}:null,querySelectorAll:()=>[]},chrome:{runtime:{lastError:null,sendMessage:(_message,callback)=>callback({ok:true,question}),onMessage:{addListener:fn=>{listener=fn;}}}},fetch:async()=>({ok:false}),AbortSignal};
    vm.runInNewContext(source,context);
    const result=await new Promise(resolve=>listener({type:'ACMCODER_CAPTURE'},{},resolve));
    assert.equal(result.ok,true,result.error);assert.match(result.page.content,/10\^4/);
    const p=capturedProblem(result.page);assert.equal(p.payload.rawSamples.length,2);assert.equal(p.payload.cases.length,0);
  }
});
