CREATE TABLE IF NOT EXISTS device_requests (
  id TEXT PRIMARY KEY, code_hash TEXT NOT NULL UNIQUE, user_code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL, mode TEXT NOT NULL, challenge TEXT, redirect_uri TEXT, state TEXT,
  expires_at INTEGER NOT NULL, poll_at INTEGER NOT NULL DEFAULT 0,
  user_id TEXT REFERENCES users(id) ON DELETE CASCADE, approved_at INTEGER,
  consumed_at INTEGER, claim TEXT
);
CREATE INDEX IF NOT EXISTS device_requests_expiry ON device_requests(expires_at);
CREATE TABLE IF NOT EXISTS device_grants (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL, access_hash TEXT NOT NULL UNIQUE, access_expires INTEGER NOT NULL,
  refresh_hash TEXT NOT NULL UNIQUE, expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL, last_used_at INTEGER NOT NULL, revoked_at INTEGER
);
CREATE INDEX IF NOT EXISTS device_grants_owner ON device_grants(user_id);
CREATE TABLE IF NOT EXISTS device_refresh_tokens (
  token_hash TEXT PRIMARY KEY, grant_id TEXT NOT NULL REFERENCES device_grants(id) ON DELETE CASCADE,
  used_at INTEGER
);
CREATE TABLE IF NOT EXISTS device_start_limits (
  bucket TEXT PRIMARY KEY, count INTEGER NOT NULL, expires_at INTEGER NOT NULL
);
