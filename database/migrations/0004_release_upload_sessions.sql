CREATE TABLE IF NOT EXISTS release_uploads (
  id TEXT PRIMARY KEY,
  r2_key TEXT NOT NULL UNIQUE,
  r2_upload_id TEXT NOT NULL,
  platform TEXT NOT NULL CHECK (platform IN ('android','ios','windows','macos')),
  version TEXT NOT NULL,
  build_number INTEGER NOT NULL,
  file_name TEXT NOT NULL,
  content_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL CHECK (size_bytes > 0),
  notes TEXT NOT NULL DEFAULT '',
  admin_telegram_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'uploading' CHECK (status IN ('uploading','completed','aborted','expired')),
  release_id TEXT REFERENCES app_releases(id),
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_release_uploads_expiry ON release_uploads(status, expires_at);

CREATE TABLE IF NOT EXISTS release_upload_parts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  upload_session_id TEXT NOT NULL REFERENCES release_uploads(id) ON DELETE CASCADE,
  part_number INTEGER NOT NULL CHECK (part_number BETWEEN 1 AND 10000),
  etag TEXT NOT NULL,
  size_bytes INTEGER NOT NULL CHECK (size_bytes > 0),
  created_at INTEGER NOT NULL,
  UNIQUE(upload_session_id, part_number)
);
