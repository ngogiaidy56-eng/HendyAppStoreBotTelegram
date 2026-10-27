-- Canonical schema assembled from ordered migrations.
-- Production must use Wrangler migrations; this file is for review/fresh local bootstrap only.

-- ===== 0001_core_schema.sql =====
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  telegram_id TEXT NOT NULL UNIQUE,
  username TEXT,
  first_name TEXT NOT NULL DEFAULT '',
  last_name TEXT NOT NULL DEFAULT '',
  language_code TEXT,
  balance_vnd INTEGER NOT NULL DEFAULT 0 CHECK (balance_vnd >= 0),
  is_banned INTEGER NOT NULL DEFAULT 0 CHECK (is_banned IN (0,1)),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_users_created_at ON users(created_at);

CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT 'Khác',
  price_vnd INTEGER NOT NULL CHECK (price_vnd >= 0),
  kind TEXT NOT NULL DEFAULT 'code' CHECK (kind IN ('code','link')),
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_products_active_category ON products(is_active, category);

CREATE TABLE IF NOT EXISTS orders (
  order_id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  product_id TEXT NOT NULL REFERENCES products(id),
  idempotency_key TEXT NOT NULL,
  amount_vnd INTEGER NOT NULL CHECK (amount_vnd >= 0),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','completed','failed')),
  created_at INTEGER NOT NULL,
  completed_at INTEGER,
  UNIQUE(user_id, idempotency_key)
);
CREATE INDEX IF NOT EXISTS idx_orders_user_created ON orders(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS code_inventory (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id TEXT NOT NULL REFERENCES products(id),
  secret_value TEXT NOT NULL,
  order_id TEXT UNIQUE REFERENCES orders(order_id),
  sold_at INTEGER,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_inventory_available ON code_inventory(product_id, sold_at, id);

CREATE TABLE IF NOT EXISTS wallet_transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  kind TEXT NOT NULL CHECK (kind IN ('deposit','purchase','giftcode','admin_adjustment')),
  amount_vnd INTEGER NOT NULL,
  reference TEXT NOT NULL UNIQUE,
  note TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_wallet_user_created ON wallet_transactions(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS deposit_requests (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  reference TEXT NOT NULL UNIQUE,
  amount_vnd INTEGER NOT NULL CHECK (amount_vnd > 0),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','credited','expired','cancelled')),
  provider_tx_id TEXT UNIQUE,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_deposits_user_created ON deposit_requests(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS bank_webhook_events (
  provider_tx_id TEXT PRIMARY KEY,
  reference TEXT NOT NULL,
  raw_event_hash TEXT NOT NULL,
  received_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS giftcodes (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE COLLATE NOCASE,
  amount_vnd INTEGER NOT NULL CHECK (amount_vnd > 0),
  max_uses INTEGER NOT NULL DEFAULT 1 CHECK (max_uses > 0),
  used_count INTEGER NOT NULL DEFAULT 0 CHECK (used_count >= 0),
  expires_at INTEGER,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS giftcode_redemptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  giftcode_id TEXT NOT NULL REFERENCES giftcodes(id),
  user_id INTEGER NOT NULL REFERENCES users(id),
  redeemed_at INTEGER NOT NULL,
  UNIQUE(giftcode_id, user_id)
);

CREATE TABLE IF NOT EXISTS app_releases (
  id TEXT PRIMARY KEY,
  platform TEXT NOT NULL CHECK (platform IN ('android','ios','windows','macos')),
  version TEXT NOT NULL,
  build_number INTEGER NOT NULL DEFAULT 1,
  r2_key TEXT NOT NULL,
  sha256 TEXT,
  notes TEXT NOT NULL DEFAULT '',
  is_active INTEGER NOT NULL DEFAULT 0 CHECK (is_active IN (0,1)),
  created_at INTEGER NOT NULL,
  UNIQUE(platform, version)
);
CREATE INDEX IF NOT EXISTS idx_releases_platform_active ON app_releases(platform, is_active, created_at DESC);

CREATE TABLE IF NOT EXISTS audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_telegram_id TEXT,
  action TEXT NOT NULL,
  target_type TEXT NOT NULL DEFAULT '',
  target_id TEXT NOT NULL DEFAULT '',
  details_json TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at DESC);

-- ===== 0002_release_metadata.sql =====
ALTER TABLE app_releases ADD COLUMN file_name TEXT NOT NULL DEFAULT 'artifact.bin';
ALTER TABLE app_releases ADD COLUMN content_type TEXT NOT NULL DEFAULT 'application/octet-stream';
ALTER TABLE app_releases ADD COLUMN size_bytes INTEGER NOT NULL DEFAULT 0;

-- ===== 0003_vip_levels.sql =====
ALTER TABLE users ADD COLUMN total_spent_vnd INTEGER NOT NULL DEFAULT 0 CHECK (total_spent_vnd >= 0);
ALTER TABLE users ADD COLUMN vip_level TEXT NOT NULL DEFAULT 'bronze' CHECK (vip_level IN ('bronze','silver','gold','platinum'));

-- ===== 0004_release_upload_sessions.sql =====
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

-- ===== 0005_queue_dlq.sql =====
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

-- ===== 0006_tasks_minigames.sql =====
CREATE TABLE IF NOT EXISTS referrals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  referrer_user_id INTEGER NOT NULL REFERENCES users(id),
  referred_user_id INTEGER NOT NULL UNIQUE REFERENCES users(id),
  reward_vnd INTEGER NOT NULL DEFAULT 0 CHECK (reward_vnd >= 0),
  rewarded_at INTEGER,
  created_at INTEGER NOT NULL,
  CHECK (referrer_user_id <> referred_user_id)
);
CREATE INDEX IF NOT EXISTS idx_referrals_referrer ON referrals(referrer_user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS daily_checkins (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  day_key TEXT NOT NULL,
  reward_vnd INTEGER NOT NULL CHECK (reward_vnd >= 0),
  created_at INTEGER NOT NULL,
  UNIQUE(user_id, day_key)
);
CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  task_type TEXT NOT NULL DEFAULT 'manual' CHECK (task_type IN ('manual','referrals','purchases')),
  target_count INTEGER NOT NULL DEFAULT 1 CHECK (target_count > 0),
  reward_vnd INTEGER NOT NULL CHECK (reward_vnd >= 0),
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS user_tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id TEXT NOT NULL REFERENCES tasks(id),
  user_id INTEGER NOT NULL REFERENCES users(id),
  progress_count INTEGER NOT NULL DEFAULT 0 CHECK (progress_count >= 0),
  status TEXT NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress','completed','claimed')),
  completed_at INTEGER,
  claimed_at INTEGER,
  UNIQUE(task_id,user_id)
);
CREATE INDEX IF NOT EXISTS idx_user_tasks_user ON user_tasks(user_id, status);
CREATE TABLE IF NOT EXISTS minigame_spins (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  day_key TEXT NOT NULL,
  prize_key TEXT NOT NULL,
  reward_vnd INTEGER NOT NULL DEFAULT 0 CHECK (reward_vnd >= 0),
  created_at INTEGER NOT NULL,
  UNIQUE(user_id,day_key)
);
CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'info' CHECK (kind IN ('info','success','warning','maintenance')),
  created_at INTEGER NOT NULL,
  read_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, created_at DESC);

-- ===== 0007_bot_configs.sql =====
CREATE TABLE IF NOT EXISTS bot_configs (
  config_key TEXT PRIMARY KEY,
  value_json TEXT NOT NULL,
  updated_by TEXT,
  updated_at INTEGER NOT NULL
);
INSERT OR IGNORE INTO bot_configs(config_key,value_json,updated_by,updated_at) VALUES
 ('maintenance_enabled','false','system',unixepoch()),
 ('maintenance_message','"Hệ thống đang bảo trì, vui lòng quay lại sau."','system',unixepoch()),
 ('daily_checkin_reward_vnd','1000','system',unixepoch()),
 ('referral_reward_vnd','2000','system',unixepoch()),
 ('minigame_enabled','true','system',unixepoch());

CREATE TABLE IF NOT EXISTS user_states (
  telegram_id TEXT PRIMARY KEY,
  state_json TEXT NOT NULL DEFAULT '{}',
  updated_at INTEGER NOT NULL
);

-- ===== 0008_feature_flags.sql =====
CREATE TABLE IF NOT EXISTS feature_flags (
  flag_key TEXT PRIMARY KEY,
  description TEXT NOT NULL DEFAULT '',
  enabled INTEGER NOT NULL DEFAULT 0 CHECK (enabled IN (0,1)),
  rollout_percent INTEGER NOT NULL DEFAULT 100 CHECK (rollout_percent BETWEEN 0 AND 100),
  updated_by TEXT,
  updated_at INTEGER NOT NULL
);
INSERT OR IGNORE INTO feature_flags(flag_key,description,enabled,rollout_percent,updated_by,updated_at) VALUES
 ('referrals','Giới thiệu bạn bè',1,100,'system',unixepoch()),
 ('daily_checkin','Điểm danh hàng ngày',1,100,'system',unixepoch()),
 ('notifications','Hộp thư thông báo',1,100,'system',unixepoch()),
 ('tasks','Nhiệm vụ nhận thưởng',1,100,'system',unixepoch()),
 ('minigame','Vòng quay miễn phí mỗi ngày',1,100,'system',unixepoch()),
 ('app_releases','Cổng tải ứng dụng đa nền tảng',1,100,'system',unixepoch());

-- ===== 0009_central_config.sql =====
-- Store non-secret configuration only; credential values live in GitHub Actions Secrets.
CREATE TABLE IF NOT EXISTS central_configs (
  config_key TEXT PRIMARY KEY,
  value_json TEXT NOT NULL,
  updated_by TEXT,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS central_config_secrets (
  secret_key TEXT PRIMARY KEY,
  updated_by TEXT,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_central_configs_updated_at ON central_configs(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_central_config_secrets_updated_at ON central_config_secrets(updated_at DESC);
