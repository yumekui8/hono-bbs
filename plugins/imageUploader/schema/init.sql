CREATE TABLE IF NOT EXISTS images (
  id                    TEXT    PRIMARY KEY,
  storage_key           TEXT    NOT NULL UNIQUE,
  original_filename     TEXT,
  content_type          TEXT    NOT NULL,
  size                  INTEGER,
  status                TEXT    NOT NULL DEFAULT 'pending', -- pending, active, reported, deleted
  turnstile_session_id  TEXT,
  report_count          INTEGER NOT NULL DEFAULT 0,
  created_at            TEXT    NOT NULL,
  confirmed_at          TEXT,
  expires_at            TEXT,
  delete_token          TEXT    -- アップロード者が削除するためのトークン (投稿時に生成)
);

CREATE INDEX IF NOT EXISTS idx_images_status     ON images(status);
CREATE INDEX IF NOT EXISTS idx_images_expires_at ON images(expires_at);
