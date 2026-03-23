-- MySQL / MariaDB 向け初期化スクリプト
-- 使い方: mysql -u user -p dbname < schema/init.mysql.sql
--
-- 注意: TEXT 型を PRIMARY KEY に使えないため VARCHAR(255) を使用
--       日本語テキストのため utf8mb4 を使用

DROP TABLE IF EXISTS posts;
DROP TABLE IF EXISTS threads;
DROP TABLE IF EXISTS boards;
DROP TABLE IF EXISTS bbs_root;
DROP TABLE IF EXISTS user_groups;
DROP TABLE IF EXISTS users;
DROP TABLE IF EXISTS groups;

-- bbs_root: 板作成権限を管理するルートオブジェクト (シングルトン, id='__root__' 固定)
CREATE TABLE bbs_root (
  id VARCHAR(255) PRIMARY KEY,
  owner_user_id VARCHAR(255),
  owner_group_id VARCHAR(255),
  permissions VARCHAR(50) NOT NULL DEFAULT '15,14,12,8'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- groups を先に作成 (users が FK で参照するため)
CREATE TABLE groups (
  id VARCHAR(255) PRIMARY KEY,
  name VARCHAR(255) NOT NULL UNIQUE,
  created_at VARCHAR(30) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE users (
  id VARCHAR(255) PRIMARY KEY,                  -- ログインID兼表示ID (英数字・ハイフン・アンダーバー、7-128文字、変更不可)
  display_name VARCHAR(255) NOT NULL DEFAULT '', -- 表示名 (日本語可、0-128文字)
  bio TEXT,                                     -- 自己紹介 (省略可)
  email VARCHAR(255),                           -- メールアドレス (省略可)
  is_active INTEGER NOT NULL DEFAULT 1,         -- アカウント有効フラグ (0=無効、管理者のみ変更可)
  password_hash TEXT NOT NULL,
  primary_group_id VARCHAR(255),
  created_at VARCHAR(30) NOT NULL,
  updated_at VARCHAR(30) NOT NULL,
  FOREIGN KEY (primary_group_id) REFERENCES groups(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE user_groups (
  user_id VARCHAR(255) NOT NULL,
  group_id VARCHAR(255) NOT NULL,
  PRIMARY KEY (user_id, group_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- permissions 形式: "owner,group,auth,anon"
-- 各値は操作ビットマスク: DELETE=1, PUT=2, POST=4, GET=8 (例: 15=全操作, 8=GETのみ)
CREATE TABLE boards (
  id VARCHAR(255) PRIMARY KEY,
  owner_user_id VARCHAR(255),
  owner_group_id VARCHAR(255),
  permissions VARCHAR(50) NOT NULL DEFAULT '15,14,12,12',
  -- owner: 全操作, group: GET+POST+PUT, auth: GET+POST, anon: GET+POST
  name VARCHAR(255) NOT NULL,
  description TEXT,
  max_threads INTEGER NOT NULL DEFAULT 1000,
  max_thread_title_length INTEGER NOT NULL DEFAULT 200,
  default_max_posts INTEGER NOT NULL DEFAULT 1000,
  default_max_post_length INTEGER NOT NULL DEFAULT 2000,
  default_max_post_lines INTEGER NOT NULL DEFAULT 100,
  default_max_poster_name_length INTEGER NOT NULL DEFAULT 50,
  default_max_poster_sub_info_length INTEGER NOT NULL DEFAULT 100,
  default_max_poster_meta_info_length INTEGER NOT NULL DEFAULT 200,
  default_poster_name VARCHAR(255) NOT NULL DEFAULT '名無し',
  default_id_format VARCHAR(50) NOT NULL DEFAULT 'daily_hash',
  default_thread_owner_user_id VARCHAR(255),
  default_thread_owner_group_id VARCHAR(255),
  default_thread_permissions VARCHAR(50) NOT NULL DEFAULT '15,14,12,12',
  category VARCHAR(128),                        -- カテゴリ / タグ (省略可, 最大128文字)
  created_at VARCHAR(30) NOT NULL,
  creator_user_id VARCHAR(255),
  creator_session_id VARCHAR(255),
  creator_turnstile_session_id VARCHAR(255),
  FOREIGN KEY (owner_user_id) REFERENCES users(id),
  FOREIGN KEY (owner_group_id) REFERENCES groups(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE threads (
  id VARCHAR(255) PRIMARY KEY,
  board_id VARCHAR(255) NOT NULL,
  owner_user_id VARCHAR(255),
  owner_group_id VARCHAR(255),
  permissions VARCHAR(50) NOT NULL DEFAULT '15,14,12,12',
  title TEXT NOT NULL,
  max_posts INTEGER,
  max_post_length INTEGER,
  max_post_lines INTEGER,
  max_poster_name_length INTEGER,
  max_poster_sub_info_length INTEGER,
  max_poster_meta_info_length INTEGER,
  poster_name VARCHAR(255),
  id_format VARCHAR(50),
  post_count INTEGER NOT NULL DEFAULT 0,
  created_at VARCHAR(30) NOT NULL,
  updated_at VARCHAR(30) NOT NULL,
  creator_user_id VARCHAR(255),
  creator_session_id VARCHAR(255),
  creator_turnstile_session_id VARCHAR(255),
  FOREIGN KEY (board_id) REFERENCES boards(id) ON DELETE CASCADE,
  FOREIGN KEY (owner_user_id) REFERENCES users(id),
  FOREIGN KEY (owner_group_id) REFERENCES groups(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE posts (
  id VARCHAR(255) PRIMARY KEY,
  thread_id VARCHAR(255) NOT NULL,
  post_number INTEGER NOT NULL,
  owner_user_id VARCHAR(255),                   -- 投稿者ユーザID (匿名の場合 NULL)
  owner_group_id VARCHAR(255),                  -- スレッドの ownerGroupId を継承
  permissions VARCHAR(50) NOT NULL DEFAULT '10,10,10,8',
  -- owner: GET+PUT, group: GET+PUT, auth: GET+PUT, anon: GETのみ
  user_id VARCHAR(255),                         -- ログイン中ユーザID (adminMeta 用)
  display_user_id VARCHAR(255) NOT NULL DEFAULT '',
  poster_name VARCHAR(255) NOT NULL,
  poster_sub_info VARCHAR(255),
  content TEXT NOT NULL,
  is_deleted INTEGER NOT NULL DEFAULT 0,        -- ソフト削除フラグ (1=削除済み)
  created_at VARCHAR(30) NOT NULL,
  creator_user_id VARCHAR(255),
  creator_session_id VARCHAR(255),
  creator_turnstile_session_id VARCHAR(255),
  FOREIGN KEY (thread_id) REFERENCES threads(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- bbs_root 初期データ
INSERT INTO bbs_root (id, owner_user_id, owner_group_id, permissions) VALUES
  ('__root__', NULL, 'bbs-admin-group', '15,14,12,8');

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
