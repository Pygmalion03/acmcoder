import { validateMutation, recordBytes, RECORD_KINDS } from '../../shared/records.js';
import { migrateLegacyRecords } from './record-migration.js';

export const DEFAULT_RECORD_LIMITS = { userBytes: 8 * 1024 * 1024, globalBytes: 128 * 1024 * 1024, problems: 200 };
const unpack = row => row ? { kind:row.kind, id:row.id, ...(row.problem_id ? { problemId:row.problem_id } : {}), ...(row.language ? { language:row.language } : {}), revision:row.revision, updatedAt:row.updated_at, payload: row.deleted ? null : JSON.parse(row.payload_json), deleted:!!row.deleted } : null;
const hash = async value => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))), n => n.toString(16).padStart(2,'0')).join('');

export function createRecordRepository(db, { limits = {} } = {}) {
  limits = { ...DEFAULT_RECORD_LIMITS, ...limits };
  for (const value of Object.values(limits)) if (!Number.isSafeInteger(value) || value < 1) throw new Error('INVALID_LIMIT');
  const raw = (userId,kind,id) => db.prepare('SELECT * FROM unified_records WHERE user_id=? AND kind=? AND id=?').bind(userId,kind,id).first();
  const get = async ({ userId,kind,id }) => unpack(await raw(userId,kind,id));
  const cursor = async userId => (await db.prepare('SELECT COALESCE(MAX(seq),0) AS n FROM record_changes WHERE user_id=?').bind(userId).first()).n;
  const replay = async (userId,m) => db.prepare('SELECT fingerprint,result_json FROM record_mutations WHERE user_id=? AND mutation_id=?').bind(userId,m.mutationId).first();
  async function list({ userId,kind,cursor:after = '',limit = 50 }) {
    if (kind !== undefined && !RECORD_KINDS.includes(kind)) throw new Error('INVALID_KIND');
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) throw new Error('INVALID_LIMIT');
    const rows = (await db.prepare(`SELECT * FROM unified_records WHERE user_id=? AND deleted=0 ${kind ? 'AND kind=?' : ''} AND (kind || ':' || id)>? ORDER BY kind,id LIMIT ?`).bind(userId,...(kind ? [kind] : []),after || '',limit+1).all()).results;
    const page = rows.slice(0,limit);
    return { items:page.map(unpack), nextCursor:rows.length > limit ? `${page.at(-1).kind}:${page.at(-1).id}` : null };
  }
  async function apply({ userId,mutation }) {
    const m = validateMutation(mutation);
    const fingerprint = await hash(JSON.stringify(m));
    const cached = await replay(userId,m);
    if (cached) {
      if (cached.fingerprint !== fingerprint) throw new Error('MUTATION_REUSED');
      return JSON.parse(cached.result_json);
    }
    const previous = await raw(userId,m.kind,m.id);
    const conflict = async () => ({ applied:[], conflicts:[{ mutationId:m.mutationId,current:await get({userId,kind:m.kind,id:m.id}) }], cursor:await cursor(userId) });
    if ((previous?.revision || 0) !== m.baseRevision || previous?.deleted || (m.op === 'delete' && !previous)) return conflict();
    if (m.op === 'put' && previous && ['attempt','run'].includes(m.kind)) throw new Error('IMMUTABLE_RECORD');
    if (m.op === 'put' && m.problemId) {
      const parent = await raw(userId,'problem',m.problemId);
      if (!parent || parent.deleted) throw new Error('PROBLEM_NOT_FOUND');
    }
    const deleted = m.op === 'delete';
    const payload = deleted ? null : JSON.stringify(m.payload);
    const bytes = deleted ? 128 : recordBytes(m.payload) + 256;
    // Charge a conservative allowance for the durable mutation and change index too.
    const delta = bytes - (previous?.bytes || 0) + 512;
    const problemDelta = m.kind === 'problem' ? (deleted ? -1 : previous ? 0 : 1) : 0;
    const revision = m.baseRevision + 1;
    const result = { applied:[{ mutationId:m.mutationId,revision }], conflicts:[], cursor:0 };
    await db.prepare('INSERT OR IGNORE INTO record_usage(user_id) VALUES(?)').bind(userId).run();
    const statements = [
      db.prepare('INSERT INTO record_mutations(user_id,mutation_id,fingerprint,result_json) VALUES(?,?,?,?)').bind(userId,m.mutationId,fingerprint,JSON.stringify(result)),
      db.prepare('UPDATE record_usage SET bytes=bytes+?, problems=problems+? WHERE user_id=? AND bytes+?<=? AND problems+?<=?').bind(delta,problemDelta,userId,delta,limits.userBytes,problemDelta,limits.problems),
      db.prepare('UPDATE record_mutations SET capacity_ok=changes() WHERE user_id=? AND mutation_id=?').bind(userId,m.mutationId),
      db.prepare('UPDATE record_totals SET bytes=bytes+? WHERE id=1 AND bytes+?<=?').bind(delta,delta,limits.globalBytes),
      db.prepare('UPDATE record_mutations SET capacity_ok=changes() WHERE user_id=? AND mutation_id=?').bind(userId,m.mutationId),
      db.prepare(`INSERT INTO unified_records(user_id,kind,id,problem_id,language,revision,updated_at,payload_json,deleted,bytes)
        SELECT ?,?,?,?,?,?,?,?,?,? WHERE (?=0 OR EXISTS(SELECT 1 FROM unified_records WHERE user_id=? AND kind=? AND id=? AND revision=? AND deleted=0)) AND (? IS NULL OR EXISTS(SELECT 1 FROM unified_records WHERE user_id=? AND kind='problem' AND id=? AND deleted=0))
        ON CONFLICT(user_id,kind,id) DO UPDATE SET problem_id=excluded.problem_id,language=excluded.language,revision=excluded.revision,updated_at=excluded.updated_at,payload_json=excluded.payload_json,deleted=excluded.deleted,bytes=excluded.bytes
        WHERE unified_records.revision=? AND unified_records.deleted=0`)
        .bind(userId,m.kind,m.id,deleted ? previous.problem_id : m.problemId || null,deleted ? previous.language : m.language || null,revision,Date.now(),payload,deleted ? 1 : 0,bytes,m.baseRevision,userId,m.kind,m.id,m.baseRevision,deleted?null:m.problemId||null,userId,m.problemId||null,m.baseRevision),
      db.prepare(`UPDATE record_mutations SET applied=changes(),result_json=json_set(result_json,'$.cursor',(SELECT COALESCE(MAX(seq),0) FROM record_changes WHERE user_id=?)) WHERE user_id=? AND mutation_id=?`).bind(userId,userId,m.mutationId)
    ];
    if(deleted&&m.kind==='problem'){
      // Keep child tombstones too; old devices may replay children independently.
      statements.push(
        db.prepare('UPDATE unified_records SET payload_json=NULL,deleted=1,revision=revision+1,updated_at=? WHERE user_id=? AND problem_id=? AND deleted=0').bind(Date.now(),userId,m.id),
        db.prepare(`UPDATE record_mutations SET result_json=json_set(result_json,'$.cursor',(SELECT COALESCE(MAX(seq),0) FROM record_changes WHERE user_id=?)) WHERE user_id=? AND mutation_id=?`).bind(userId,userId,m.mutationId)
      );
    }
    try { await db.batch(statements); }
    catch (error) {
      const saved = await replay(userId,m);
      if (saved) { if (saved.fingerprint !== fingerprint) throw new Error('MUTATION_REUSED'); return JSON.parse(saved.result_json); }
      if (/capacity_available/.test(error.message)) throw new Error('CAPACITY_REACHED');
      if (/mutation_applied|unified_records.user_id, unified_records.problem_id/.test(error.message)) return conflict();
      throw error;
    }
    return JSON.parse((await replay(userId,m)).result_json);
  }
  const repo = { get,list,apply,cursor, limits };
  repo.migrateLegacy = options => migrateLegacyRecords(db,repo,options);
  return repo;
}
