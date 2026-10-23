-- These are conservative application budgets, not D1 physical storage sizes.
-- Repair old cascade deletions whose payload was removed but whose bytes still
-- described the original content. Keep all tombstones and protocol history.
-- The bookkeeping repair must not advance record revisions or sync cursors.
DROP TRIGGER unified_update;

UPDATE unified_records SET bytes=CASE
  WHEN deleted=1 THEN 128
  ELSE length(CAST(payload_json AS BLOB))+256
END;

CREATE TRIGGER unified_update AFTER UPDATE ON unified_records BEGIN
  INSERT INTO record_changes(user_id,kind,id,revision) VALUES(NEW.user_id,NEW.kind,NEW.id,NEW.revision);
  INSERT INTO user_data_revisions(user_id,revision) VALUES(NEW.user_id,1)
    ON CONFLICT(user_id) DO UPDATE SET revision=revision+1;
END;

INSERT OR IGNORE INTO record_usage(user_id)
  SELECT user_id FROM unified_records
  UNION SELECT user_id FROM record_mutations
  UNION SELECT user_id FROM record_changes;

-- A direct mutation still costs the existing 512-byte allowance: 384 for the
-- mutation and 128 for its change. Cascaded children each add a change only.
UPDATE record_usage SET
  bytes=COALESCE((SELECT SUM(bytes) FROM unified_records r WHERE r.user_id=record_usage.user_id),0)
    +384*(SELECT COUNT(*) FROM record_mutations m WHERE m.user_id=record_usage.user_id)
    +128*(SELECT COUNT(*) FROM record_changes c WHERE c.user_id=record_usage.user_id),
  problems=(SELECT COUNT(*) FROM unified_records r
    WHERE r.user_id=record_usage.user_id AND r.kind='problem' AND r.deleted=0);

UPDATE record_totals SET bytes=COALESCE((SELECT SUM(bytes) FROM record_usage),0) WHERE id=1;
