import test from 'node:test';
import assert from 'node:assert/strict';
import {IDBFactory} from 'fake-indexeddb';
import {capturedProblem,captureCurrentProblem} from '../extension/capture.js';
import {createExtensionStore,migrateExtensionDrafts} from '../extension/store.js';
const page={url:'https://leetcode.cn/problems/two-sum/',slug:'two-sum',title:'两数之和',content:'题目\n示例 1\n输入：nums = [2,7], target = 9\n输出：[0,1]\n提示\n1 <= n',tags:['数组']};
test('capture preserves original samples and rejects foreign or stale question metadata',()=>{
 const p=capturedProblem(page);assert.equal(p.id,'lc-two-sum');assert.match(p.payload.rawSamples[0],/nums = \[2,7\]/);assert.equal(p.payload.cases.length,0);
 assert.throws(()=>capturedProblem({...page,slug:'wrong'}),/不匹配/);assert.throws(()=>capturedProblem({...page,url:'https://example.com/problems/two-sum/'}),/不匹配/);
});
test('SPA switch while capture is pending never saves old question under new url',async()=>{
 const tabs={query:async()=>[{id:1,url:page.url}],sendMessage:async()=>({ok:true,page}),get:async()=>({url:'https://leetcode.cn/problems/three-sum/'})};
 await assert.rejects(captureCurrentProblem({tabs,scripting:{}}),/已切题/);
 tabs.get=async()=>({url:page.url});assert.equal((await captureCurrentProblem({tabs,scripting:{}})).payload.title,'两数之和');
});
test('extension upgrade imports old language drafts once without reading credentials or changing old data',async()=>{
 const old={'acmcoder.lastPage':page,'acmcoder.sidebar.workspace.two-sum.python':{code:'旧代码',stdin:'输入',expected:'输出'},'acmcoder.sidebar.workspace.two-sum.cpp':{code:'int main(){}'},'acmcoder.apiKey':'must not read'};
 const storage={getKeys:async()=>Object.keys(old),get:async keys=>{assert.ok(!keys.includes('acmcoder.apiKey'));return Object.fromEntries(keys.map(k=>[k,old[k]]));}};
 const store=createExtensionStore({indexedDB:new IDBFactory(),storage:null});
 await migrateExtensionDrafts({store,storage});assert.equal((await store.getDraft({problemId:'lc-two-sum',language:'python'})).code,'旧代码');assert.equal((await store.getDraft({problemId:'lc-two-sum',language:'cpp'})).code,'int main(){}');
 await store.saveDraft({problemId:'lc-two-sum',language:'python',code:'新代码',stdin:'',expected:''});await migrateExtensionDrafts({store,storage});assert.equal((await store.getDraft({problemId:'lc-two-sum',language:'python'})).code,'新代码');assert.equal(old['acmcoder.sidebar.workspace.two-sum.python'].code,'旧代码');
});
