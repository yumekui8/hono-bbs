-- 開発環境リセット用: 全テーブルを削除して再作成する
-- 使い方: wrangler d1 execute hono-bbs-db --local --file=schema/init.sql

DROP TABLE IF EXISTS posts;
DROP TABLE IF EXISTS threads;
DROP TABLE IF EXISTS boards;
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
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  primary_group_id TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (primary_group_id) REFERENCES groups(id)
);

CREATE TABLE user_groups (
  user_id TEXT NOT NULL,
  group_id TEXT NOT NULL,
  PRIMARY KEY (user_id, group_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE
);

CREATE TABLE boards (
  id TEXT PRIMARY KEY,
  owner_user_id TEXT,
  owner_group_id TEXT,
  permissions TEXT NOT NULL DEFAULT '15,12,12',
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
  default_thread_permissions TEXT NOT NULL DEFAULT '15,12,12',
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
  permissions TEXT NOT NULL DEFAULT '15,12,12',
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
  user_id TEXT,
  display_user_id TEXT NOT NULL DEFAULT '',
  poster_name TEXT NOT NULL,
  poster_sub_info TEXT,
  content TEXT NOT NULL,
  created_at TEXT NOT NULL,
  creator_user_id TEXT,
  creator_session_id TEXT,
  creator_turnstile_session_id TEXT,
  FOREIGN KEY (thread_id) REFERENCES threads(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

-- システムグループ (固定ID)
INSERT INTO groups (id, name, created_at) VALUES
  ('sys-user-admin-group', 'userAdminGroup', '2024-01-01T00:00:00.000Z'),
  ('sys-bbs-admin-group',  'bbsAdminGroup',  '2024-01-01T00:00:00.000Z'),
  ('sys-admin-group',      'admin',          '2024-01-01T00:00:00.000Z'),
  ('sys-general-group',    'general',        '2024-01-01T00:00:00.000Z');

-- admin ユーザー (パスワードは POST /auth/setup で設定)
INSERT INTO users (id, username, password_hash, primary_group_id, created_at) VALUES
  ('sys-admin', 'admin', '__NEEDS_SETUP__', 'sys-admin-group', '2024-01-01T00:00:00.000Z');

-- admin を全システムグループに追加
INSERT INTO user_groups (user_id, group_id) VALUES
  ('sys-admin', 'sys-admin-group'),
  ('sys-admin', 'sys-user-admin-group'),
  ('sys-admin', 'sys-bbs-admin-group'),
  ('sys-admin', 'sys-general-group');
