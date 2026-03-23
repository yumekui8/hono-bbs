-- 開発環境リセット用: 全テーブルを削除して再作成する
-- 使い方: wrangler d1 execute hono-bbs-db --local --file=schema/init.sql

DROP TABLE IF EXISTS posts;
DROP TABLE IF EXISTS threads;
DROP TABLE IF EXISTS boards;
DROP TABLE IF EXISTS bbs_root;
DROP TABLE IF EXISTS user_groups;
DROP TABLE IF EXISTS users;
DROP TABLE IF EXISTS groups;
-- sessions と turnstile_sessions は Cloudflare KV に移行済み (D1 では管理しない)

-- groups を先に作成 (users が FK で参照するため)
CREATE TABLE groups (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL
);

CREATE TABLE users (
  id TEXT PRIMARY KEY,                          -- ログインID兼表示ID (英数字・ハイフン・アンダーバー、7-128文字、変更不可)
  display_name TEXT NOT NULL DEFAULT '',        -- 表示名 (日本語可、0-128文字)
  bio TEXT,                                     -- 自己紹介 (省略可)
  email TEXT,                                   -- メールアドレス (省略可)
  is_active INTEGER NOT NULL DEFAULT 1,         -- アカウント有効フラグ (0=無効、管理者のみ変更可)
  password_hash TEXT NOT NULL,
  primary_group_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (primary_group_id) REFERENCES groups(id)
);

CREATE TABLE user_groups (
  user_id TEXT NOT NULL,
  group_id TEXT NOT NULL,
  PRIMARY KEY (user_id, group_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE
);

-- permissions 形式: "owner,group,auth,anon"
-- 各値は操作ビットマスク: DELETE=1, PUT=2, POST=4, GET=8 (例: 15=全操作, 8=GETのみ)
CREATE TABLE boards (
  id TEXT PRIMARY KEY,
  owner_user_id TEXT,
  owner_group_id TEXT,
  permissions TEXT NOT NULL DEFAULT '15,14,12,12',
  -- owner: 全操作, group: GET+POST+PUT, auth: GET+POST, anon: GET+POST
  name TEXT NOT NULL,
  description TEXT,
  max_threads INTEGER NOT NULL DEFAULT 1000,
  max_thread_title_length INTEGER NOT NULL DEFAULT 200,
  default_max_posts INTEGER NOT NULL DEFAULT 1000,
  default_max_post_length INTEGER NOT NULL DEFAULT 2000,
  default_max_post_lines INTEGER NOT NULL DEFAULT 100,
  default_max_poster_name_length INTEGER NOT NULL DEFAULT 50,
  default_max_poster_sub_info_length INTEGER NOT NULL DEFAULT 100,
  default_max_poster_meta_info_length INTEGER NOT NULL DEFAULT 200,
  default_poster_name TEXT NOT NULL DEFAULT '名無し',
  default_id_format TEXT NOT NULL DEFAULT 'daily_hash',
  default_thread_owner_user_id TEXT,
  default_thread_owner_group_id TEXT,
  default_thread_permissions TEXT NOT NULL DEFAULT '15,14,12,12',
  category TEXT,                                -- カテゴリ / タグ (省略可, 最大128文字)
  created_at TEXT NOT NULL,
  creator_user_id TEXT,
  creator_session_id TEXT,
  creator_turnstile_session_id TEXT,
  FOREIGN KEY (owner_user_id) REFERENCES users(id),
  FOREIGN KEY (owner_group_id) REFERENCES groups(id)
);

CREATE TABLE threads (
  id TEXT PRIMARY KEY,
  board_id TEXT NOT NULL,
  owner_user_id TEXT,
  owner_group_id TEXT,
  permissions TEXT NOT NULL DEFAULT '15,14,12,12',
  title TEXT NOT NULL,
  max_posts INTEGER,
  max_post_length INTEGER,
  max_post_lines INTEGER,
  max_poster_name_length INTEGER,
  max_poster_sub_info_length INTEGER,
  max_poster_meta_info_length INTEGER,
  poster_name TEXT,
  id_format TEXT,
  post_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  creator_user_id TEXT,
  creator_session_id TEXT,
  creator_turnstile_session_id TEXT,
  FOREIGN KEY (board_id) REFERENCES boards(id) ON DELETE CASCADE,
  FOREIGN KEY (owner_user_id) REFERENCES users(id),
  FOREIGN KEY (owner_group_id) REFERENCES groups(id)
);

CREATE TABLE posts (
  id TEXT PRIMARY KEY,
  thread_id TEXT NOT NULL,
  post_number INTEGER NOT NULL,
  owner_user_id TEXT,                           -- 投稿者ユーザID (匿名の場合 NULL)
  owner_group_id TEXT,                          -- スレッドの ownerGroupId を継承
  permissions TEXT NOT NULL DEFAULT '10,10,10,8',
  -- owner: GET+PUT, group: GET+PUT, auth: GET+PUT, anon: GETのみ
  user_id TEXT,                                 -- ログイン中ユーザID (adminMeta 用)
  display_user_id TEXT NOT NULL DEFAULT '',
  poster_name TEXT NOT NULL,
  poster_sub_info TEXT,
  content TEXT NOT NULL,
  is_deleted INTEGER NOT NULL DEFAULT 0,            -- ソフト削除フラグ (1=削除済み)
  created_at TEXT NOT NULL,
  creator_user_id TEXT,
  creator_session_id TEXT,
  creator_turnstile_session_id TEXT,
  FOREIGN KEY (thread_id) REFERENCES threads(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

-- システムグループ
-- ADMIN_USERNAME 環境変数でカスタマイズ可能 (デフォルト: admin)
-- USER_ADMIN_GROUP / BBS_ADMIN_GROUP 環境変数でカスタマイズ可能
INSERT INTO groups (id, name, created_at) VALUES
  ('user-admin-group', 'userAdminGroup', '2024-01-01T00:00:00.000Z'),
  ('bbs-admin-group',  'bbsAdminGroup',  '2024-01-01T00:00:00.000Z'),
  ('admin-group',      'adminGroup',     '2024-01-01T00:00:00.000Z'),
  ('general-group',    'general',        '2024-01-01T00:00:00.000Z');

-- admin ユーザー (パスワードは POST /auth/setup で設定)
-- ADMIN_USERNAME 環境変数でカスタマイズする場合はこの ID も変更すること
INSERT INTO users (id, display_name, bio, email, is_active, password_hash, primary_group_id, created_at, updated_at) VALUES
  ('admin', 'admin', NULL, NULL, 1, '__NEEDS_SETUP__', 'admin-group', '2024-01-01T00:00:00.000Z', '2024-01-01T00:00:00.000Z');

-- admin を全システムグループに追加
INSERT INTO user_groups (user_id, group_id) VALUES
  ('admin', 'admin-group'),
  ('admin', 'user-admin-group'),
  ('admin', 'bbs-admin-group'),
  ('admin', 'general-group');
