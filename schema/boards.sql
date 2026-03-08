CREATE TABLE IF NOT EXISTS boards (
  id TEXT PRIMARY KEY,

  -- 所有者情報
  owner_user_id TEXT,
  owner_group_id TEXT,
  -- パーミッション "owner,group,other" 各値はビットマスク(8=r,4=w,2=d,1=a)
  permissions TEXT NOT NULL DEFAULT '15,12,12',

  -- 表示情報
  name TEXT NOT NULL,
  description TEXT,

  -- スレッド設定
  max_threads INTEGER NOT NULL DEFAULT 1000,
  max_thread_title_length INTEGER NOT NULL DEFAULT 200,

  -- 板のデフォルト投稿設定 (スレッドのメタ情報で上書き可)
  default_max_posts INTEGER NOT NULL DEFAULT 1000,
  default_max_post_length INTEGER NOT NULL DEFAULT 2000,
  default_max_post_lines INTEGER NOT NULL DEFAULT 100,
  default_max_poster_name_length INTEGER NOT NULL DEFAULT 50,
  default_max_poster_sub_info_length INTEGER NOT NULL DEFAULT 100,
  default_max_poster_meta_info_length INTEGER NOT NULL DEFAULT 200,
  default_poster_name TEXT NOT NULL DEFAULT '名無し',
  -- IDフォーマット: daily_hash | daily_hash_or_user | api_key_hash | api_key_hash_or_user | none
  default_id_format TEXT NOT NULL DEFAULT 'daily_hash',

  -- この板に作成されるスレッドのデフォルト所有者
  default_thread_owner_user_id TEXT,
  default_thread_owner_group_id TEXT,
  default_thread_permissions TEXT NOT NULL DEFAULT '15,12,12',

  created_at TEXT NOT NULL,

  -- 作成者情報 (管理者のみ参照可)
  creator_user_id TEXT,
  creator_session_id TEXT,
  creator_turnstile_session_id TEXT,

  FOREIGN KEY (owner_user_id) REFERENCES users(id),
  FOREIGN KEY (owner_group_id) REFERENCES groups(id)
);
