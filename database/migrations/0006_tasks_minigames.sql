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
