-- An older retained Worker does not know about daily run reservations.
-- Keep enforcement in the database while recognizing rc.2's existing reservation.
ALTER TABLE unified_records ADD COLUMN legacy_import INTEGER NOT NULL DEFAULT 0
  CHECK(legacy_import IN (0,1));
CREATE TABLE record_run_reservations (
  user_id TEXT PRIMARY KEY,
  mutation_id TEXT NOT NULL,
  FOREIGN KEY(user_id,mutation_id) REFERENCES record_mutations(user_id,mutation_id) ON DELETE CASCADE
);

CREATE TRIGGER record_run_reserved AFTER UPDATE OF run_quota_ok ON record_mutations
WHEN NEW.run_quota_ok=1 BEGIN
  INSERT INTO record_run_reservations(user_id,mutation_id) VALUES(NEW.user_id,NEW.mutation_id)
    ON CONFLICT(user_id) DO UPDATE SET mutation_id=excluded.mutation_id;
END;

CREATE TRIGGER unified_run_quota_check BEFORE INSERT ON unified_records
WHEN NEW.kind='run' AND NEW.deleted=0 AND NEW.legacy_import=0
  AND NOT EXISTS(SELECT 1 FROM record_run_reservations WHERE user_id=NEW.user_id)
BEGIN
  SELECT CASE WHEN COALESCE((SELECT count FROM record_daily_runs
    WHERE user_id=NEW.user_id AND day=date('now')),0)>=100
    -- Old Workers recognize the capacity marker and preserve their local queue.
    THEN RAISE(ABORT,'capacity_available: DAILY_RUN_LIMIT') END;
END;

CREATE TRIGGER unified_run_quota_commit AFTER INSERT ON unified_records
WHEN NEW.kind='run' AND NEW.deleted=0 AND NEW.legacy_import=0 BEGIN
  INSERT INTO record_daily_runs(user_id,day,count)
    SELECT NEW.user_id,date('now'),1
    WHERE NOT EXISTS(SELECT 1 FROM record_run_reservations WHERE user_id=NEW.user_id)
    ON CONFLICT(user_id,day) DO UPDATE SET count=count+1;
  DELETE FROM record_run_reservations WHERE user_id=NEW.user_id;
END;
