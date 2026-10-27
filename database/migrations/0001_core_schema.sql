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
