-- 開発環境リセット用: 全テーブルを削除して再作成する
-- 使い方: wrangler d1 execute hono-bbs-db --local --file=schema/init.sql

DROP TABLE IF EXISTS posts;
DROP TABLE IF EXISTS threads;
DROP TABLE IF EXISTS boards;
DROP TABLE IF EXISTS user_roles;
DROP TABLE IF EXISTS users;
DROP TABLE IF EXISTS roles;

-- permissions 形式: "admins,members,users,anon"
-- 各値は操作ビットマスク: GET=16, POST=8, PUT=4, PATCH=2, DELETE=1 (例: 31=全操作, 16=GETのみ)

-- roles を先に作成 (users が FK で参照するため)
CREATE TABLE roles (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL
);

CREATE TABLE users (
  id TEXT PRIMARY KEY,                          -- ログインID兼表示ID (英数字・ハイフン・アンダーバー、7-128文字、変更不可)
  display_name TEXT NOT NULL DEFAULT '',        -- 表示名 (日本語可)
  bio TEXT,                                     -- 自己紹介 (省略可)
  email TEXT,                                   -- メールアドレス (省略可)
  is_active INTEGER NOT NULL DEFAULT 1,         -- アカウント有効フラグ (0=無効)
  password_hash TEXT NOT NULL,
  primary_role_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (primary_role_id) REFERENCES roles(id)
);

CREATE TABLE user_roles (
  user_id TEXT NOT NULL,
  role_id TEXT NOT NULL,
  PRIMARY KEY (user_id, role_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE
);

CREATE TABLE boards (
  id TEXT PRIMARY KEY,
  administrators TEXT NOT NULL DEFAULT '',  -- カンマ区切りのユーザID/ロールID
  members TEXT NOT NULL DEFAULT '',
  permissions TEXT NOT NULL DEFAULT '31,28,24,16',
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  max_threads INTEGER NOT NULL DEFAULT 1000,          -- 0=無制限
  max_thread_title_length INTEGER NOT NULL DEFAULT 200, -- 0=無制限
  default_max_posts INTEGER NOT NULL DEFAULT 1000,    -- 0=無制限
  default_max_post_length INTEGER NOT NULL DEFAULT 2000, -- 0=無制限
  default_max_post_lines INTEGER NOT NULL DEFAULT 100,   -- 0=無制限
  default_max_poster_name_length INTEGER NOT NULL DEFAULT 50,   -- 0=無制限
  default_max_poster_option_length INTEGER NOT NULL DEFAULT 100, -- 0=無制限
  default_poster_name TEXT NOT NULL DEFAULT '名無し',
  default_id_format TEXT NOT NULL DEFAULT 'daily_hash',
  default_thread_administrators TEXT NOT NULL DEFAULT '',  -- $CREATOR 等のテンプレート可
  default_thread_members TEXT NOT NULL DEFAULT '',
  default_thread_permissions TEXT NOT NULL DEFAULT '31,28,24,16',
  default_post_administrators TEXT NOT NULL DEFAULT '',  -- $CREATOR, $PARENTS 等のテンプレート可
  default_post_members TEXT NOT NULL DEFAULT '',
  default_post_permissions TEXT NOT NULL DEFAULT '31,28,24,16',
  category TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  creator_user_id TEXT,
  creator_session_id TEXT,
  creator_turnstile_session_id TEXT
);

CREATE TABLE threads (
  id TEXT PRIMARY KEY,
  board_id TEXT NOT NULL,
  administrators TEXT NOT NULL DEFAULT '',
  members TEXT NOT NULL DEFAULT '',
  permissions TEXT NOT NULL DEFAULT '31,28,24,16',
  title TEXT NOT NULL,
  max_posts INTEGER NOT NULL DEFAULT 0,             -- 0=ボードのデフォルトを継承
  max_post_length INTEGER NOT NULL DEFAULT 0,
  max_post_lines INTEGER NOT NULL DEFAULT 0,
  max_poster_name_length INTEGER NOT NULL DEFAULT 0,
  max_poster_option_length INTEGER NOT NULL DEFAULT 0,
  poster_name TEXT NOT NULL DEFAULT '',             -- '' = ボードのデフォルトを継承
  id_format TEXT NOT NULL DEFAULT '',               -- '' = ボードのデフォルトを継承
  post_count INTEGER NOT NULL DEFAULT 0,
  is_edited INTEGER NOT NULL DEFAULT 0,
  edited_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  creator_user_id TEXT,
  creator_session_id TEXT,
  creator_turnstile_session_id TEXT,
  FOREIGN KEY (board_id) REFERENCES boards(id) ON DELETE CASCADE
);

CREATE TABLE posts (
  id TEXT PRIMARY KEY,
  thread_id TEXT NOT NULL,
  post_number INTEGER NOT NULL,
  administrators TEXT NOT NULL DEFAULT '',
  members TEXT NOT NULL DEFAULT '',
  permissions TEXT NOT NULL DEFAULT '31,28,24,16',
  author_id TEXT NOT NULL DEFAULT '',  -- idFormat に従って計算された表示ID
  poster_name TEXT NOT NULL DEFAULT '',
  poster_option_info TEXT NOT NULL DEFAULT '',
  content TEXT NOT NULL,
  is_deleted INTEGER NOT NULL DEFAULT 0,
  is_edited INTEGER NOT NULL DEFAULT 0,
  edited_at TEXT,
  created_at TEXT NOT NULL,
  creator_user_id TEXT,
  creator_session_id TEXT,
  creator_turnstile_session_id TEXT,
  FOREIGN KEY (thread_id) REFERENCES threads(id) ON DELETE CASCADE
);

-- 組み込みロール
-- ADMIN_USERNAME 環境変数でカスタマイズ可能 (デフォルト: admin)
-- USER_ADMIN_ROLE 環境変数でカスタマイズ可能
INSERT OR IGNORE INTO roles (id, name, created_at) VALUES
  ('user-admin-role', 'userAdminRole', '2024-01-01T00:00:00.000Z'),
  ('admin-role',      'adminRole',     '2024-01-01T00:00:00.000Z'),
  ('general-role',    'general',       '2024-01-01T00:00:00.000Z');

-- admin ユーザー (パスワードは POST /auth/setup で設定)
INSERT OR IGNORE INTO users (id, display_name, bio, email, is_active, password_hash, primary_role_id, created_at, updated_at) VALUES
  ('admin', 'admin', NULL, NULL, 1, '__NEEDS_SETUP__', 'admin-role', '2024-01-01T00:00:00.000Z', '2024-01-01T00:00:00.000Z');

-- admin を全システムロールに追加
INSERT OR IGNORE INTO user_roles (user_id, role_id) VALUES
  ('admin', 'admin-role'),
  ('admin', 'user-admin-role'),
  ('admin', 'general-role');
