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
