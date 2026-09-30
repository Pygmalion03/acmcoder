CREATE TABLE record_daily_runs (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 0 CHECK(count >= 0),
  PRIMARY KEY(user_id,day)
);
ALTER TABLE record_mutations ADD COLUMN run_quota_ok INTEGER NOT NULL DEFAULT 1
  CONSTRAINT daily_run_available CHECK(run_quota_ok=1);

-- Seed today's existing activity; never trim records to fit the new allowance.
INSERT INTO record_daily_runs(user_id,day,count)
SELECT user_id,date('now'),COUNT(*) FROM (
  SELECT user_id FROM unified_records
    WHERE kind='run' AND date(updated_at/1000,'unixepoch')=date('now')
  UNION ALL
  SELECT s.user_id FROM submissions s
    WHERE date(s.created_at,'unixepoch')=date('now') AND NOT EXISTS (
      SELECT 1 FROM record_legacy_ids l
      WHERE l.user_id=s.user_id AND l.kind='run' AND l.source_id=s.id
    )
) GROUP BY user_id;
