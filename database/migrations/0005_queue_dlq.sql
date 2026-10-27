-- Extend wallet ledger kinds for rewards without deleting existing history.
DROP INDEX IF EXISTS idx_wallet_user_created;
ALTER TABLE wallet_transactions RENAME TO wallet_transactions_legacy;
CREATE TABLE wallet_transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  kind TEXT NOT NULL CHECK (kind IN ('deposit','purchase','giftcode','admin_adjustment','daily_checkin','referral','task_reward','minigame')),
  amount_vnd INTEGER NOT NULL,
  reference TEXT NOT NULL UNIQUE,
  note TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL
);
INSERT INTO wallet_transactions(id,user_id,kind,amount_vnd,reference,note,created_at)
SELECT id,user_id,kind,amount_vnd,reference,note,created_at FROM wallet_transactions_legacy;
DROP TABLE wallet_transactions_legacy;
CREATE INDEX idx_wallet_user_created ON wallet_transactions(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS queue_jobs (
  id TEXT PRIMARY KEY,
  job_type TEXT NOT NULL,
  payload_json TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','completed','failed','dead_letter')),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  available_at INTEGER NOT NULL,
  last_error TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_queue_jobs_poll ON queue_jobs(status, available_at, created_at);
CREATE TABLE IF NOT EXISTS dead_letter_jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id TEXT NOT NULL,
  job_type TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  attempts INTEGER NOT NULL,
  error_message TEXT NOT NULL DEFAULT '',
  failed_at INTEGER NOT NULL
);
