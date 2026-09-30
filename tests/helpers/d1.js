import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';

export function createTestDatabase(migrations = ['0001_initial.sql', '0002_restore_entries.sql', '0003_unified_records.sql', '0005_daily_run_quota.sql']) {
  const sqlite = new DatabaseSync(':memory:');
  for (const file of migrations) sqlite.exec(readFileSync(new URL(`../../cloudflare/migrations/${file}`, import.meta.url), 'utf8'));
  let pending = Promise.resolve();
  const prepare = (sql, params = []) => ({
    bind: (...values) => prepare(sql, values),
    first: async () => sqlite.prepare(sql).get(...params) || null,
    all: async () => ({ results: sqlite.prepare(sql).all(...params) }),
    run: async () => ({ meta: { changes: sqlite.prepare(sql).run(...params).changes } })
  });
  const db = { prepare, batch(statements) {
    const work = pending.then(async () => {
      sqlite.exec('BEGIN');
      try {
        const results = [];
        for (const statement of statements) results.push(await statement.run());
        sqlite.exec('COMMIT');
        return results;
      } catch (error) { sqlite.exec('ROLLBACK'); throw error; }
    });
    pending = work.catch(() => {});
    return work;
  } };
  for (const id of ['a', 'b']) sqlite.prepare('INSERT INTO users (id,github_id,login,created_at,updated_at) VALUES (?,?,?,1,1)').run(id,id,id);
  return { db, sqlite };
}
