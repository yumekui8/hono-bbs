CREATE TABLE IF NOT EXISTS posts (
  id TEXT PRIMARY KEY,
  thread_id TEXT NOT NULL,

  -- スレッド内の連番 (書き込みID: {thread_id}_{post_number})
  post_number INTEGER NOT NULL,

  -- ユーザ情報
  user_id TEXT,           -- NULLは匿名
  display_user_id TEXT NOT NULL DEFAULT '',  -- IDフォーマットで計算した表示ID
  poster_name TEXT NOT NULL,
  poster_sub_info TEXT,   -- sage等のサブ情報

  -- 本文
  content TEXT NOT NULL,

  created_at TEXT NOT NULL,

  -- 作成者情報 (管理者のみ参照可)
  creator_user_id TEXT,
  creator_session_id TEXT,
  creator_turnstile_session_id TEXT,

  FOREIGN KEY (thread_id) REFERENCES threads(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id)
);
