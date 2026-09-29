CREATE TABLE restore_entries (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  batch_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  source_key TEXT NOT NULL,
  input_hash TEXT NOT NULL,
  outcome TEXT NOT NULL,
  target_id TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, batch_id, kind, source_key)
);
CREATE INDEX restore_entries_by_user_batch ON restore_entries(user_id, batch_id);

CREATE TABLE user_data_revisions (user_id TEXT PRIMARY KEY, revision INTEGER NOT NULL DEFAULT 0);
CREATE TRIGGER revision_personal_problems_insert AFTER INSERT ON personal_problems BEGIN
  INSERT INTO user_data_revisions (user_id, revision) VALUES (NEW.user_id, 1)
  ON CONFLICT(user_id) DO UPDATE SET revision = revision + 1;
END;
CREATE TRIGGER revision_personal_problems_update AFTER UPDATE ON personal_problems BEGIN
  INSERT INTO user_data_revisions (user_id, revision) VALUES (NEW.user_id, 1)
  ON CONFLICT(user_id) DO UPDATE SET revision = revision + 1;
END;
CREATE TRIGGER revision_personal_problems_delete AFTER DELETE ON personal_problems BEGIN
  INSERT INTO user_data_revisions (user_id, revision) VALUES (OLD.user_id, 1)
  ON CONFLICT(user_id) DO UPDATE SET revision = revision + 1;
END;
CREATE TRIGGER revision_drafts_insert AFTER INSERT ON drafts BEGIN
  INSERT INTO user_data_revisions (user_id, revision) VALUES (NEW.user_id, 1)
  ON CONFLICT(user_id) DO UPDATE SET revision = revision + 1;
END;
CREATE TRIGGER revision_drafts_update AFTER UPDATE ON drafts BEGIN
  INSERT INTO user_data_revisions (user_id, revision) VALUES (NEW.user_id, 1)
  ON CONFLICT(user_id) DO UPDATE SET revision = revision + 1;
END;
CREATE TRIGGER revision_drafts_delete AFTER DELETE ON drafts BEGIN
  INSERT INTO user_data_revisions (user_id, revision) VALUES (OLD.user_id, 1)
  ON CONFLICT(user_id) DO UPDATE SET revision = revision + 1;
END;
CREATE TRIGGER revision_submissions_insert AFTER INSERT ON submissions BEGIN
  INSERT INTO user_data_revisions (user_id, revision) VALUES (NEW.user_id, 1)
  ON CONFLICT(user_id) DO UPDATE SET revision = revision + 1;
END;
CREATE TRIGGER revision_submissions_update AFTER UPDATE ON submissions BEGIN
  INSERT INTO user_data_revisions (user_id, revision) VALUES (NEW.user_id, 1)
  ON CONFLICT(user_id) DO UPDATE SET revision = revision + 1;
END;
CREATE TRIGGER revision_submissions_delete AFTER DELETE ON submissions BEGIN
  INSERT INTO user_data_revisions (user_id, revision) VALUES (OLD.user_id, 1)
  ON CONFLICT(user_id) DO UPDATE SET revision = revision + 1;
END;
CREATE TRIGGER revision_practice_progress_insert AFTER INSERT ON practice_progress BEGIN
  INSERT INTO user_data_revisions (user_id, revision) VALUES (NEW.user_id, 1)
  ON CONFLICT(user_id) DO UPDATE SET revision = revision + 1;
END;
CREATE TRIGGER revision_practice_progress_update AFTER UPDATE ON practice_progress BEGIN
  INSERT INTO user_data_revisions (user_id, revision) VALUES (NEW.user_id, 1)
  ON CONFLICT(user_id) DO UPDATE SET revision = revision + 1;
END;
CREATE TRIGGER revision_practice_progress_delete AFTER DELETE ON practice_progress BEGIN
  INSERT INTO user_data_revisions (user_id, revision) VALUES (OLD.user_id, 1)
  ON CONFLICT(user_id) DO UPDATE SET revision = revision + 1;
END;
CREATE TRIGGER revision_daily_plans_insert AFTER INSERT ON daily_plans BEGIN
  INSERT INTO user_data_revisions (user_id, revision) VALUES (NEW.user_id, 1)
  ON CONFLICT(user_id) DO UPDATE SET revision = revision + 1;
END;
CREATE TRIGGER revision_daily_plans_update AFTER UPDATE ON daily_plans BEGIN
  INSERT INTO user_data_revisions (user_id, revision) VALUES (NEW.user_id, 1)
  ON CONFLICT(user_id) DO UPDATE SET revision = revision + 1;
END;
CREATE TRIGGER revision_daily_plans_delete AFTER DELETE ON daily_plans BEGIN
  INSERT INTO user_data_revisions (user_id, revision) VALUES (OLD.user_id, 1)
  ON CONFLICT(user_id) DO UPDATE SET revision = revision + 1;
END;
CREATE TRIGGER revision_user_settings_insert AFTER INSERT ON user_settings BEGIN
  INSERT INTO user_data_revisions (user_id, revision) VALUES (NEW.user_id, 1)
  ON CONFLICT(user_id) DO UPDATE SET revision = revision + 1;
END;
CREATE TRIGGER revision_user_settings_update AFTER UPDATE ON user_settings BEGIN
  INSERT INTO user_data_revisions (user_id, revision) VALUES (NEW.user_id, 1)
  ON CONFLICT(user_id) DO UPDATE SET revision = revision + 1;
END;
CREATE TRIGGER revision_user_settings_delete AFTER DELETE ON user_settings BEGIN
  INSERT INTO user_data_revisions (user_id, revision) VALUES (OLD.user_id, 1)
  ON CONFLICT(user_id) DO UPDATE SET revision = revision + 1;
END;
