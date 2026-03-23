-- bbs_root テーブルを追加するマイグレーション (MySQL / MariaDB 用)
-- 既存 DB に適用する場合はこのファイルを実行してください
--
-- 使い方: mysql -u user -p dbname < schema/migrate_add_bbs_root.mysql.sql

CREATE TABLE IF NOT EXISTS bbs_root (
  id VARCHAR(255) PRIMARY KEY,
  owner_user_id VARCHAR(255),
  owner_group_id VARCHAR(255),
  permissions VARCHAR(50) NOT NULL DEFAULT '15,14,12,8'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO bbs_root (id, owner_user_id, owner_group_id, permissions) VALUES
  ('__root__', NULL, 'bbs-admin-group', '15,14,12,8');
