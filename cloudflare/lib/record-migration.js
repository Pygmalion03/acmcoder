const sources = [
  ['problem','personal_problems','id'], ['draft','drafts','problem_id'], ['run','submissions','id'],
  ['progress','practice_progress','problem_id'], ['plan','daily_plans',"day || ':' || problem_id"], ['settings','user_settings','user_id']
];
const hashId = async text => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text))), n=>n.toString(16).padStart(2,'0')).join('').slice(0,32);
function publicSettings(value) {
  if (Array.isArray(value)) return value.map(publicSettings);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).filter(([key]) => !/^(api[_-]?key|access[_-]?token|refresh[_-]?token|authorization|password|secret|cookie)$/i.test(key)).map(([key,item])=>[key,publicSettings(item)]));
}
function convert(kind,row) {
  if (kind === 'problem') return { title:row.title, statement:row.statement, sourceUrl:row.source_url, sourceKind:row.source_kind, tags:JSON.parse(row.tags_json), rawSamples:JSON.parse(row.raw_samples_json), cases:JSON.parse(row.cases_json), favorite:!!row.favorite, archivedAt:null, createdAt:row.created_at*1000 };
  if (kind === 'draft') return { code:row.code,stdin:row.stdin,expected:row.expected,mode:'normal',previousAttemptId:null };
  if (kind === 'run') return { code:row.code,stdout:row.stdout,stderr:row.stderr,status:row.status,createdAt:row.created_at*1000 };
  if (kind === 'progress') return { attempts:row.attempts,successes:row.successes,lastStatus:row.last_status,lastPracticedAt:row.last_practiced_at*1000 };
  if (kind === 'plan') return { day:row.day,items:[{ problemId:row.problem_id,completed:!!row.completed }],timezone:'Asia/Shanghai' };
  return publicSettings(JSON.parse(row.settings_json));
}
export async function migrateLegacyRecords(db,repo,{userId,cursor=null,limit=25}) {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 50) throw new Error('INVALID_LIMIT');
  const state = await db.prepare('SELECT completed FROM record_migrations WHERE user_id=?').bind(userId).first();
  if (state?.completed) return { imported:0,nextCursor:null,completed:true };
  const match = cursor === null ? ['','0','0'] : /^(\d):([0-9]{1,9})$/.exec(cursor);
  if (!match || Number(match[1]) >= sources.length) throw new Error('INVALID_CURSOR');
  await db.prepare('INSERT OR IGNORE INTO record_migrations(user_id,completed) VALUES(?,0)').bind(userId).run();
  const stage = Number(match[1]), offset = Number(match[2]);
  const [kind,table,key] = sources[stage];
  const rows = (await db.prepare(`SELECT *,${key} AS source_key FROM ${table} WHERE user_id=? ORDER BY ${key} LIMIT ? OFFSET ?`).bind(userId,limit,offset).all()).results;
  let imported = 0;
  for (const row of rows) {
    const sourceId = row.source_key;
    const targetId = kind === 'problem' ? row.id : kind === 'draft' ? `${row.problem_id}--python` : `legacy-${kind}-${await hashId(sourceId)}`;
    if (row.problem_id && !await repo.get({userId,kind:'problem',id:row.problem_id})) {
      const builtIn = ['sum','free'].includes(row.problem_id);
      await repo.apply({userId,mutation:{mutationId:`legacy-parent-${await hashId(row.problem_id)}`,kind:'problem',id:row.problem_id,op:'put',baseRevision:0,payload:{title:row.problem_id === 'sum' ? '两个整数相加' : row.problem_id === 'free' ? '自由练习' : '已移除题目（历史恢复）',statement:'',sourceKind:builtIn ? 'builtin' : 'legacy',archivedAt:builtIn ? null : 1}}});
    }
    const result = await repo.apply({userId,legacyImport:true,mutation:{mutationId:`legacy-${kind}-${await hashId(sourceId)}`,kind,id:targetId,op:'put',baseRevision:0,...(row.problem_id ? {problemId:row.problem_id} : {}),...(['draft','run'].includes(kind) ? {language:'python'} : {}),payload:convert(kind,row)}});
    if (result.conflicts.length) throw new Error('MIGRATION_CONFLICT');
    await db.prepare('INSERT OR IGNORE INTO record_legacy_ids(user_id,kind,source_id,target_id) VALUES(?,?,?,?)').bind(userId,kind,sourceId,targetId).run();
    imported++;
  }
  const nextCursor = rows.length === limit ? `${stage}:${offset+rows.length}` : stage+1 < sources.length ? `${stage+1}:0` : null;
  if (nextCursor === null) await db.prepare('UPDATE record_migrations SET completed=1 WHERE user_id=?').bind(userId).run();
  return {imported,nextCursor,completed:nextCursor === null};
}
