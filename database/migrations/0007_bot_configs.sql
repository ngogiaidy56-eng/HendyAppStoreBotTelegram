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
