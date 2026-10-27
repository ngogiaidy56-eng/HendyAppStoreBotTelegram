ALTER TABLE app_releases ADD COLUMN file_name TEXT NOT NULL DEFAULT 'artifact.bin';
ALTER TABLE app_releases ADD COLUMN content_type TEXT NOT NULL DEFAULT 'application/octet-stream';
ALTER TABLE app_releases ADD COLUMN size_bytes INTEGER NOT NULL DEFAULT 0;
