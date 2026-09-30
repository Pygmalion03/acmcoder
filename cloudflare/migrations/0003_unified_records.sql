CREATE TABLE IF NOT EXISTS unified_records (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL, id TEXT NOT NULL, problem_id TEXT, language TEXT,
  revision INTEGER NOT NULL, updated_at INTEGER NOT NULL,
  payload_json TEXT, deleted INTEGER NOT NULL DEFAULT 0, bytes INTEGER NOT NULL,
  PRIMARY KEY(user_id, kind, id)
);
CREATE UNIQUE INDEX IF NOT EXISTS unified_draft_identity ON unified_records(user_id,problem_id,language) WHERE kind='draft' AND deleted=0;
CREATE INDEX IF NOT EXISTS unified_problem_records ON unified_records(user_id,problem_id);
CREATE TABLE IF NOT EXISTS record_changes (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL, id TEXT NOT NULL, revision INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS record_changes_by_user ON record_changes(user_id,seq);
CREATE TABLE IF NOT EXISTS record_mutations (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  mutation_id TEXT NOT NULL, fingerprint TEXT NOT NULL, result_json TEXT NOT NULL,
  applied INTEGER NOT NULL DEFAULT 1 CONSTRAINT mutation_applied CHECK(applied=1),
  capacity_ok INTEGER NOT NULL DEFAULT 1 CONSTRAINT capacity_available CHECK(capacity_ok=1),
  PRIMARY KEY(user_id,mutation_id)
);
CREATE TABLE IF NOT EXISTS record_usage (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  bytes INTEGER NOT NULL DEFAULT 0, problems INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS record_totals (id INTEGER PRIMARY KEY CHECK(id=1), bytes INTEGER NOT NULL DEFAULT 0);
INSERT OR IGNORE INTO record_totals(id,bytes) VALUES(1,0);
CREATE TABLE IF NOT EXISTS record_migrations (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  completed INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS record_legacy_ids (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL, source_id TEXT NOT NULL, target_id TEXT NOT NULL,
  PRIMARY KEY(user_id,kind,source_id)
);
CREATE TRIGGER IF NOT EXISTS unified_insert AFTER INSERT ON unified_records BEGIN
  INSERT INTO record_changes(user_id,kind,id,revision) VALUES(NEW.user_id,NEW.kind,NEW.id,NEW.revision);
  INSERT INTO user_data_revisions(user_id,revision) VALUES(NEW.user_id,1) ON CONFLICT(user_id) DO UPDATE SET revision=revision+1;
END;
CREATE TRIGGER IF NOT EXISTS unified_update AFTER UPDATE ON unified_records BEGIN
  INSERT INTO record_changes(user_id,kind,id,revision) VALUES(NEW.user_id,NEW.kind,NEW.id,NEW.revision);
  INSERT INTO user_data_revisions(user_id,revision) VALUES(NEW.user_id,1) ON CONFLICT(user_id) DO UPDATE SET revision=revision+1;
END;
CREATE TRIGGER IF NOT EXISTS unified_usage_delete AFTER DELETE ON record_usage BEGIN
  UPDATE record_totals SET bytes=MAX(0,bytes-OLD.bytes) WHERE id=1;
END;
