ALTER TABLE users ADD COLUMN total_spent_vnd INTEGER NOT NULL DEFAULT 0 CHECK (total_spent_vnd >= 0);
ALTER TABLE users ADD COLUMN vip_level TEXT NOT NULL DEFAULT 'bronze' CHECK (vip_level IN ('bronze','silver','gold','platinum'));
