import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeProblem,parseImportInput } from '../shared/import.js';

test('source samples are preserved without inventing ACM stdin', () => {
  const result=normalizeProblem({title:'两数之和',statement:'Find a pair',sourceUrl:'https://leetcode.cn/problems/two-sum/',rawSamples:['nums=[2,7], target=9']});
  assert.deepEqual(result.rawSamples,['nums=[2,7], target=9']);
  assert.deepEqual(result.cases,[]);
  assert.equal(parseImportInput('https://leetcode.cn/problems/two-sum/').type,'url');
  assert.throws(()=>normalizeProblem({title:'x',sourceUrl:'javascript:alert(1)'}));
  assert.equal(normalizeProblem({title:'x',statement:'<script>test</script>'}).statement,'<script>test</script>');
});
