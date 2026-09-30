import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeBackup} from '../shared/backup.js';

test('legacy backup preserves all runs and plans, remaps drafts and strips credentials',()=>{
  const legacy={schemaVersion:1,problems:[{id:'one',title:'One',statement:'text'}],drafts:[{problem_id:'one',code:'saved',stdin:'1',expected:'2'}],submissions:Array.from({length:106},(_,i)=>({id:`run-${i}`,problem_id:'one',status:'self_pass',code:`print(${i})`,stdout:'',stderr:'',created_at:1})),progress:[],plans:[{day:'2020-01-01',problem_id:'one',completed:1}],settings:{theme:'dark',apiKey:'must-not-copy'}};
  const backup=normalizeBackup(legacy);
  assert.equal(backup.version,3);
  assert.equal(backup.records.filter(r=>r.kind==='run').length,106);
  assert.equal(backup.records.find(r=>r.kind==='draft').id,'one--python');
  assert.equal(backup.records.find(r=>r.kind==='plan').payload.completed.one,true);
  assert.equal(JSON.stringify(backup).includes('must-not-copy'),false);
  const modern=normalizeBackup({...legacy,schemaVersion:2,settings:[{settings:{theme:'light'}}]});
  assert.equal(modern.records.find(r=>r.kind==='settings').payload.theme,'light');
});
test('orphan history receives an archived parent instead of silently being dropped',()=>{
  const backup=normalizeBackup({schemaVersion:1,problems:[],drafts:[],submissions:[{id:'old',problem_id:'missing',status:'error',code:'keep',stdout:'',stderr:'',created_at:1}],progress:[],plans:[],settings:{}});
  assert.equal(backup.records.find(r=>r.kind==='run').payload.code,'keep');
  assert.ok(backup.records.find(r=>r.kind==='problem').payload.archivedAt);
});
