-- Central configuration values are non-secret only. Actual credentials are stored as
-- encrypted GitHub Actions secrets and are never persisted in this table.
CREATE TABLE IF NOT EXISTS central_configs (
  config_key TEXT PRIMARY KEY,
  value_json TEXT NOT NULL,
  updated_by TEXT,
  updated_at INTEGER NOT NULL
);

-- Track only secret names and the time/admin that updated them; never store secret values.
CREATE TABLE IF NOT EXISTS central_config_secrets (
  secret_key TEXT PRIMARY KEY,
  updated_by TEXT,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_central_configs_updated_at
  ON central_configs(updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_central_config_secrets_updated_at
  ON central_config_secrets(updated_at DESC);
