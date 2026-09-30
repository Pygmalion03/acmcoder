import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { onRequest } from '../cloudflare/functions/api/[[path]].js';

const origin = 'https://acmcoder.example';

test('BYOK relay requires login and origin, rejects arbitrary targets and stores no key',async()=>{
 const {call,sqlite,db}=fixture(),previous=globalThis.fetch;let requests=0;
 globalThis.fetch=async(url,options)=>{requests++;assert.equal(url,'https://api.deepseek.com/v1/chat/completions');assert.equal(options.redirect,'error');return Response.json({choices:[{message:{content:'answer test-key'}}]});};
 const data={provider:{baseUrl:'https://api.deepseek.com/v1',model:'chat'},key:'test-key',messages:[{role:'user',content:'自由提问'}]};
 try{
  const anonymous=await onRequest({request:new Request(`${origin}/api/ai/chat`,{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify(data)}),env:{DB:db}});assert.equal(anonymous.status,401);
  assert.equal((await call('a','ai/chat','POST',data,'https://evil.test')).status,403);assert.equal(requests,0);
  const denied=await call('b','ai/chat','POST',{...data,provider:{baseUrl:'https://evil.test',model:'chat'}});assert.equal(denied.status,400);assert.equal(requests,0);
  const result=await call('a','ai/chat','POST',data);assert.equal(result.status,200);assert.equal(result.data.message,'answer [密钥已隐藏]');assert.equal(requests,1);
  assert.ok(!JSON.stringify(sqlite.prepare('SELECT * FROM user_settings').all()).includes('test-key'));
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM unified_records').get().n,0);
 }finally{globalThis.fetch=previous;}
});

test('practice history and old plans survive new activity and remain fully exportable', async () => {
  const { call, sqlite } = fixture();
  for (let i = 0; i < 105; i++) sqlite.prepare('INSERT INTO submissions (id,user_id,problem_id,status,code,stdout,stderr,created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(`old-${i}`, 'a', 'sum', 'self_pass', `print(${i})`, String(i), '', 100 + i);
  sqlite.prepare('INSERT INTO daily_plans (user_id,day,problem_id,completed) VALUES (?,?,?,?)').run('a', '2020-01-01', 'sum', 0);
  const saved = await call('a', 'submissions', 'POST', { problemId: 'sum', status: 'self_pass', code: 'print(8)', stdout: '8', stderr: '' });
  assert.equal(saved.status, 201);
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM submissions WHERE user_id=?').get('a').n, 106);
  assert.equal((await call('a', 'plans/today', 'PUT', { plan: [{ problemId: 'sum', completed: false }] })).status, 200);
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM daily_plans WHERE day=?').get('2020-01-01').n, 1);
  const exported = await call('a', 'export');
  assert.equal(exported.data.submissions.length, 106);
  assert.ok(exported.data.plans.some(plan => plan.day === '2020-01-01'));
  const first = await call('a', 'submissions');
  assert.equal(first.data.submissions.length, 100);
  assert.ok(first.data.nextCursor);
  const second = await call('a', `submissions?cursor=${encodeURIComponent(first.data.nextCursor)}`);
  assert.equal(second.data.submissions.length, 6);
  assert.equal(new Set([...first.data.submissions, ...second.data.submissions].map(row => row.id)).size, 106);
});

function fixture() {
  const sqlite = new DatabaseSync(':memory:');
  for (const file of ['0001_initial.sql','0002_restore_entries.sql','0003_unified_records.sql','0004_device_auth.sql','0005_daily_run_quota.sql']) sqlite.exec(readFileSync(new URL(`../cloudflare/migrations/${file}`, import.meta.url), 'utf8'));
  const db = {
    prepare(sql) {
      return {
        bind(...params) {
          const statement = sqlite.prepare(sql);
          return {
            first: async () => statement.get(...params) || null,
            all: async () => ({ results: statement.all(...params) }),
            run: async () => ({ meta: { changes: statement.run(...params).changes } })
          };
        }
      };
    },
    async batch(statements) {
      sqlite.exec('BEGIN');
      try { const results=[]; for (const statement of statements) results.push(await statement.run()); sqlite.exec('COMMIT'); return results; }
      catch(error) { sqlite.exec('ROLLBACK'); throw error; }
    }
  };
  for (const [id, token] of [['a', 'a'.repeat(64)], ['b', 'b'.repeat(64)]]) {
    sqlite.prepare('INSERT INTO users (id, github_id, login, created_at, updated_at) VALUES (?, ?, ?, 1, 1)').run(id, id, id);
    sqlite.prepare('INSERT INTO sessions (token_hash, user_id, expires_at, created_at) VALUES (?, ?, 9999999999, 1)').run(createHash('sha256').update(token).digest('hex'), id);
  }
  async function call(user, path, method = 'GET', data, requestOrigin = origin, extraEnv = {}) {
    const headers = { cookie: `__Host-acm_session=${user.repeat(64)}` };
    if (data !== undefined) headers['content-type'] = 'application/json';
    if (method !== 'GET') headers.origin = requestOrigin;
    const request = new Request(`${origin}/api/${path}`, { method, headers, body: data === undefined ? undefined : JSON.stringify(data) });
    const response = await onRequest({ request, env: { DB: db, ...extraEnv } });
    return { status: response.status, data: await response.json() };
  }
  return { call, sqlite, db };
}

test('anonymous public import reads official sources, rejects foreign origins and stops at read quota',async()=>{
  const {db,sqlite}=fixture(),prior=globalThis.fetch;let upstream=0;
  globalThis.fetch=async()=>{upstream++;return Response.json({data:{question:{title:'Two Sum',translatedTitle:'两数之和',content:'<p>公开题面</p><pre>Input: 1 2\nOutput: 3</pre>'}}});};
  const request=(requestOrigin=origin)=>new Request(`${origin}/api/import/fetch`,{method:'POST',headers:{origin:requestOrigin,'content-type':'application/json','cf-connecting-ip':'test-import-ip'},body:JSON.stringify({url:'https://leetcode.cn/problems/two-sum/'})});
  try{
    assert.equal((await onRequest({request:request('https://evil.example'),env:{DB:db}})).status,403);assert.equal(upstream,0);
    const result=await onRequest({request:request(),env:{DB:db}});assert.equal(result.status,200);assert.match((await result.json()).statement,/公开题面/);const calls=upstream;
    sqlite.prepare('UPDATE device_start_limits SET count=20').run();assert.equal((await onRequest({request:request(),env:{DB:db}})).status,429);assert.equal(upstream,calls);
  }finally{globalThis.fetch=prior;}
});

test('versioned record API migrates once and prevents legacy clients from overwriting new records', async () => {
  const { call } = fixture();
  await call('a','drafts/sum','PUT',{code:'old',stdin:'',expected:'',baseVersion:null});
  let cursor=null;
  do {
    const response=await call('a','records/migrate','POST',{protocolVersion:1,cursor});
    assert.equal(response.status,200);
    cursor=response.data.nextCursor;
  } while(cursor);
  const records=await call('a','records?kind=draft');
  assert.equal(records.data.items[0].payload.code,'old');
  assert.equal((await call('b','records?kind=draft')).data.items.length,0);
  assert.equal((await call('a','drafts/sum','PUT',{code:'stale',stdin:'',expected:'',baseVersion:1})).status,409);
  const original=records.data.items[0];
  const updated=await call('a','records','POST',{protocolVersion:1,mutation:{mutationId:'updated',kind:'draft',id:original.id,problemId:'sum',language:'python',baseRevision:original.revision,op:'put',payload:{...original.payload,code:'new'}}});
  assert.equal(updated.status,200);
  assert.equal(updated.data.applied[0].revision,2);
  assert.equal((await call('a','records?kind=draft')).data.items[0].payload.code,'new');
});

test('private problems, drafts, export and plans stay with their owner', async () => {
  const { call } = fixture();
  const created = await call('a', 'problems', 'POST', { title: 'Private', statement: 'Text', cases: [{ stdin: '1\n', expected: '1\n' }] });
  assert.equal(created.status, 201);
  const id = created.data.problem.id;
  assert.equal((await call('b', `problems/${id}`)).status, 404);
  assert.equal((await call('b', `problems/${id}`, 'PATCH', { title: 'Changed' })).status, 404);
  assert.equal((await call('b', `problems/${id}`, 'DELETE')).status, 404);
  assert.equal((await call('b', 'problems')).data.problems.length, 0);
  assert.equal((await call('b', `drafts/${id}`)).status, 404);
  assert.equal((await call('b', `drafts/${id}`, 'PUT', { code: 'x', stdin: '', expected: '', baseVersion: null })).status, 404);
  assert.equal((await call('b', 'submissions', 'POST', { problemId: id, status: 'self_pass', code: '', stdout: '', stderr: '' })).status, 404);
  assert.equal((await call('b', 'plans/today', 'PUT', { plan: [{ problemId: id, completed: false }] })).status, 404);
  assert.equal((await call('b', 'export')).data.problems.length, 0);
});

test('draft version conflict preserves remote data and origin rejects writes', async () => {
  const { call } = fixture();
  const first = await call('a', 'drafts/sum', 'PUT', { code: 'one', stdin: '', expected: '', baseVersion: null });
  assert.equal(first.data.version, 1);
  const second = await call('a', 'drafts/sum', 'PUT', { code: 'two', stdin: '', expected: '', baseVersion: 1 });
  assert.equal(second.data.version, 2);
  const conflict = await call('a', 'drafts/sum', 'PUT', { code: 'stale', stdin: '', expected: '', baseVersion: 1 });
  assert.equal(conflict.status, 409);
  assert.equal(conflict.data.current.code, 'two');
  assert.equal((await call('a', 'drafts/sum')).data.draft.code, 'two');
  assert.equal((await call('a', 'drafts/sum', 'PUT', { code: 'evil', stdin: '', expected: '', baseVersion: 2 }, 'https://evil.example')).status, 403);
});

test('exported problem JSON can preserve multiple cases', async () => {
  const { call } = fixture();
  const cases = [{ stdin: '1\n', expected: 'one\n' }, { stdin: '2\n', expected: 'two\n' }];
  const created = await call('a', 'problems', 'POST', { title: 'Cases', cases, rawSamples: ['one', 'two'] });
  assert.equal(created.status, 201);
  const exported = await call('a', 'export');
  assert.deepEqual(exported.data.problems[0].cases, cases);
  assert.equal((await call('a', 'problems', 'POST', exported.data.problems[0])).status, 409);
});

test('batch import validation identifies the bad sample before writing', async () => {
  const { call } = fixture();
  const valid = await call('a', 'import/validate', 'POST', { title: 'Two samples', cases: [{ stdin: '1', expected: '1' }, { stdin: '2', expected: '2' }] });
  assert.equal(valid.status, 200);
  assert.equal(valid.data.cases, 2);
  const invalid = await call('a', 'import/validate', 'POST', { title: 'Bad', cases: [{ stdin: '1', expected: '1' }, { stdin: 2, expected: '2' }] });
  assert.equal(invalid.status, 400);
  assert.match(invalid.data.error, /第 2 组/);
  assert.equal((await call('a', 'problems')).data.problems.length, 0);
  const plan = await call('a', 'plans/today');
  assert.match(plan.data.day, /^\d{4}-\d{2}-\d{2}$/);
  assert.deepEqual((await call('a', 'plans/recommendations')).data.problemIds, []);
});

test('recommendation preferences generate an owned daily plan and allow a public question to join practice', async () => {
  const { call } = fixture();
  const catalog = await call('a', 'recommendations/catalog');
  assert.equal(catalog.status, 200);
  assert.equal(catalog.data.entries.length, 30);
  const preferences = await call('a', 'recommendations/preferences', 'PUT', { dailyCount: 2, difficultyPressure: 'conservative', cooldownDays: 3, targetTags: ['数组'] });
  assert.equal(preferences.status, 200);
  const generated = await call('a', 'recommendations/generate', 'POST');
  assert.equal(generated.status, 200);
  assert.equal(generated.data.plan.length, 2);
  assert.ok(generated.data.plan.every(item => item.problemId.startsWith('rec_')));
  assert.equal((await call('b', 'plans/today')).data.plan.length, 0);
  const slug = catalog.data.entries[0].leetcodeSlug;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => Response.json({ data: { question: { title: 'Two Sum', translatedTitle: '两数之和', translatedContent: '<p>找出两个数。</p>' } } });
  try {
    const added = await call('a', `recommendations/${slug}/add`, 'POST');
    assert.equal(added.status, 201);
    assert.equal(added.data.problem.statement, '找出两个数。');
    assert.deepEqual(added.data.problem.cases, []);
    assert.equal((await call('a', `recommendations/${slug}/add`, 'POST')).data.existing, true);
  } finally { globalThis.fetch = originalFetch; }
  assert.equal((await call('b', 'problems')).data.problems.length, 0);
  assert.equal((await call('a', `recommendations/${slug}/action`, 'POST', { action: 'mastered' })).status, 200);
  assert.equal((await call('a', 'recommendations/ranked')).data.entries.some(item => item.leetcodeSlug === slug), false);
  assert.equal((await call('a', `recommendations/${slug}/action`, 'POST', { action: 'want_practice_again' })).status, 200);
  assert.equal((await call('a', 'recommendations/ranked')).data.entries.some(item => item.leetcodeSlug === slug), true);
});

test('imported recommendations use the same settings row and reject invented plan IDs', async () => {
  const { call } = fixture();
  const entry = { leetcodeSlug: 'unique-new-question', title: '自选题', difficulty: 'hard', tags: ['图'], frequencyScore: 0.9 };
  assert.equal((await call('a', 'recommendations/catalog', 'PUT', { entries: [entry] })).status, 200);
  assert.equal((await call('a', 'recommendations/preferences', 'PUT', { dailyCount: 1, difficultyPressure: 'intensive', cooldownDays: 2, targetTags: ['图'] })).status, 200);
  const plan = await call('a', 'recommendations/generate', 'POST');
  assert.deepEqual(plan.data.plan, [{ problemId: 'rec_unique-new-question', completed: false }]);
  assert.equal((await call('a', 'plans/today', 'PUT', { plan: [{ problemId: 'rec_invented', completed: false }] })).status, 400);
  assert.equal((await call('a', 'recommendations/catalog')).data.entries[0].title, '自选题');
  assert.equal((await call('a', 'recommendations/preferences')).data.preferences.dailyCount, 1);
  assert.equal((await call('b', 'recommendations/catalog')).data.entries.length, 30);
});

test('AI help is owner bound, free-binding only and rate limited before inference', async () => {
  const { call } = fixture();
  const created = await call('a', 'problems', 'POST', { title: 'Private', statement: 'Private statement' });
  const id = created.data.problem.id;
  const request = { problemId: id, question: '哪里错了？', code: 'print(1)', stdin: '1', expected: '2', stdout: '1', stderr: '', result: '当前样例未通过', history: [] };
  assert.equal((await call('a', 'ai/help', 'POST', request)).status, 503);
  assert.equal((await call('b', 'ai/help', 'POST', request, origin, { AI: { run: async () => ({ response: 'never' }) } })).status, 404);
  const calls = [];
  const AI = { run: async (model, options) => { calls.push({ model, options }); return { response: '检查输出与期望值。' }; } };
  const answered = await call('a', 'ai/help', 'POST', request, origin, { AI });
  assert.equal(answered.status, 200);
  assert.equal(answered.data.answer, '检查输出与期望值。');
  assert.equal(calls[0].model, '@cf/qwen/qwen2.5-coder-32b-instruct');
  assert.match(calls[0].options.messages[1].content, /Private statement/);
  assert.equal((await call('a', 'ai/help', 'POST', request, origin, { AI })).status, 429);
  assert.equal(calls.length, 1);
});

test('batch delete removes only selected owned problems', async () => {
  const { call } = fixture();
  const one = (await call('a', 'problems', 'POST', { title: 'One' })).data.problem.id;
  const two = (await call('a', 'problems', 'POST', { title: 'Two' })).data.problem.id;
  const other = (await call('b', 'problems', 'POST', { title: 'Other' })).data.problem.id;
  assert.equal((await call('a', 'problems/batch-delete', 'POST', { ids: [one, other] })).status, 404);
  assert.equal((await call('a', 'problems')).data.problems.length, 2);
  assert.equal((await call('a', 'problems/batch-delete', 'POST', { ids: [one, two] })).data.deleted, 2);
  assert.equal((await call('a', 'problems')).data.problems.length, 0);
  assert.equal((await call('b', 'problems')).data.problems.length, 1);
});

test('public LeetCode fetch uses only official endpoints and reports failures as JSON', async () => {
  const { call } = fixture();
  const originalFetch = globalThis.fetch;
  const urls = [];
  globalThis.fetch = async url => {
    urls.push(url);
    return url.startsWith('https://leetcode.cn/') ? new Response('', { status: 403 }) : Response.json({ data: { question: { title: 'Two Sum', content: '<p>Find pair.</p>' } } });
  };
  try {
    const fetched = await call('a', 'import/fetch', 'POST', { url: 'https://leetcode.cn/problems/two-sum/' });
    assert.equal(fetched.status, 200);
    assert.equal(fetched.data.statement, 'Find pair.');
    assert.deepEqual(urls, ['https://leetcode.cn/graphql/', 'https://leetcode.com/graphql/']);
    globalThis.fetch = async () => new Response('', { status: 403 });
    const failed = await call('a', 'import/fetch', 'POST', { url: 'https://leetcode.cn/problems/two-sum/' });
    assert.equal(failed.status, 422);
    assert.match(failed.data.error, /HTTP 403/);
  } finally { globalThis.fetch = originalFetch; }
});

test('account deletion requires explicit confirmation and removes only that account, including device authorization',async()=>{
 const {call,sqlite}=fixture();
 for(const user of ['a','b']){
  sqlite.prepare('INSERT INTO record_usage(user_id,bytes,problems) VALUES(?,1000,1)').run(user);
  sqlite.prepare('INSERT INTO record_migrations(user_id,completed) VALUES(?,1)').run(user);
  sqlite.prepare('INSERT INTO record_daily_runs(user_id,day,count) VALUES(?,?,1)').run(user,'2026-10-01');
  sqlite.prepare(`INSERT INTO unified_records(user_id,kind,id,revision,updated_at,payload_json,bytes) VALUES(?,'problem','saved',1,1,?,1000)`).run(user,JSON.stringify({title:'Saved'}));
  sqlite.prepare(`INSERT INTO device_grants(id,user_id,name,access_hash,access_expires,refresh_hash,expires_at,created_at,last_used_at) VALUES(?,?,'test',?,9999999999,?,9999999999,1,1)`).run('grant-'+user,user,'access-'+user,'refresh-'+user);
  sqlite.prepare('INSERT INTO device_refresh_tokens(token_hash,grant_id) VALUES(?,?)').run('refresh-'+user,'grant-'+user);
 }
 assert.equal((await call('a','account','DELETE',{confirmation:'DELETE'},'https://evil.test')).status,403);
 assert.equal((await call('a','account','DELETE',{})).status,400);assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM users').get().n,2);
 assert.equal((await call('a','account','DELETE',{confirmation:'DELETE'})).status,200);
 for(const table of ['users','sessions','unified_records','record_changes','record_usage','record_migrations','device_grants','record_daily_runs']){
  const column=table==='users'?'id':'user_id';assert.equal(sqlite.prepare(`SELECT COUNT(*) n FROM ${table} WHERE ${column}=?`).get('a').n,0);
  assert.ok(sqlite.prepare(`SELECT COUNT(*) n FROM ${table} WHERE ${column}=?`).get('b').n>0);
 }
 assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM device_refresh_tokens WHERE grant_id=?').get('grant-a').n,0);
 assert.equal((await call('a','sync/push','POST',{protocolVersion:1,mutations:[]})).status,401);
});

test('account usage reports configured capacity for only the authenticated account',async()=>{
 const {call,sqlite}=fixture();sqlite.prepare('INSERT INTO record_usage(user_id,bytes,problems) VALUES(?,2048,3)').run('a');
 const result=await call('a','account/usage','GET',undefined,origin,{RECORD_USER_BYTES:'4096'});assert.equal(result.status,200);
 assert.deepEqual(result.data.usage,{bytes:2048,problems:3,dailyRuns:0});
 assert.deepEqual(result.data.limits,{userBytes:4096,problems:200,dailyRuns:100});
 assert.match(result.data.day,/^\d{4}-\d{2}-\d{2}$/);
 assert.equal(result.data.resetAt,Date.parse(`${result.data.day}T00:00:00Z`)+86400000);
 assert.equal((await call('b','account/usage')).data.usage.bytes,0);
});

test('daily run quota is enforced by direct and sync APIs and ignores client migration flags',async()=>{
 const {call,sqlite}=fixture();sqlite.prepare('INSERT INTO record_migrations(user_id,completed) VALUES(?,1)').run('a');
 const mutation={mutationId:'quota-parent',kind:'problem',id:'quota-parent',op:'put',baseRevision:0,payload:{title:'限额验收'}};
 assert.equal((await call('a','records','POST',{protocolVersion:1,mutation})).status,200);
 const day=new Date().toISOString().slice(0,10);sqlite.prepare('INSERT INTO record_daily_runs(user_id,day,count) VALUES(?,?,100)').run('a',day);
 const run={mutationId:'over-quota',kind:'run',id:'over-quota',problemId:'quota-parent',language:'python',op:'put',baseRevision:0,payload:{status:'self_pass'}};
 const direct=await call('a','records','POST',{protocolVersion:1,legacyImport:true,mutation:{...run,legacyImport:true}});
 assert.equal(direct.status,429);assert.equal(direct.data.code,'DAILY_RUN_LIMIT');assert.equal(direct.data.retryAt,Date.parse(`${day}T00:00:00Z`)+86400000);
 const sync=await call('a','sync/push','POST',{protocolVersion:1,legacyImport:true,mutations:[run]});
 assert.equal(sync.status,200);assert.equal(sync.data.errors[0].code,'DAILY_RUN_LIMIT');assert.equal(sync.data.errors[0].retryAt,direct.data.retryAt);
 assert.equal(sqlite.prepare("SELECT COUNT(*) n FROM unified_records WHERE kind='run'").get().n,0);
 assert.equal((await call('a','account/usage')).data.usage.dailyRuns,100);assert.equal((await call('b','account/usage')).data.usage.dailyRuns,0);
});
