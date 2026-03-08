CREATE TABLE IF NOT EXISTS threads (
  id TEXT PRIMARY KEY,
  board_id TEXT NOT NULL,

  -- 所有者情報
  owner_user_id TEXT,
  owner_group_id TEXT,
  permissions TEXT NOT NULL DEFAULT '15,12,12',

  -- 表示情報
  title TEXT NOT NULL,

  -- スレッド固有設定 (NULLの場合は板のデフォルト値を使用)
  max_posts INTEGER,
  max_post_length INTEGER,
  max_post_lines INTEGER,
  max_poster_name_length INTEGER,
  max_poster_sub_info_length INTEGER,
  max_poster_meta_info_length INTEGER,
  poster_name TEXT,
  -- NULLの場合は板の default_id_format を継承
  id_format TEXT,

  -- 統計
  post_count INTEGER NOT NULL DEFAULT 0,

  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,

  -- 作成者情報 (管理者のみ参照可)
  creator_user_id TEXT,
  creator_session_id TEXT,
  creator_turnstile_session_id TEXT,

  FOREIGN KEY (board_id) REFERENCES boards(id) ON DELETE CASCADE,
  FOREIGN KEY (owner_user_id) REFERENCES users(id),
  FOREIGN KEY (owner_group_id) REFERENCES groups(id)
);
