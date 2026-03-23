-- bbs_root テーブルを追加するマイグレーション (SQLite / D1 / PostgreSQL 用)
-- 既存 DB に適用する場合はこのファイルを実行してください
--
-- Cloudflare D1:
--   npx wrangler d1 execute hono-bbs-db --file=schema/migrate_add_bbs_root.sql
--
-- SQLite / PostgreSQL:
--   対応クライアントでこの SQL を実行してください

CREATE TABLE IF NOT EXISTS bbs_root (
  id TEXT PRIMARY KEY,
  owner_user_id TEXT,
  owner_group_id TEXT,
  permissions TEXT NOT NULL DEFAULT '15,14,12,8'
);

INSERT INTO bbs_root (id, owner_user_id, owner_group_id, permissions)
  SELECT '__root__', NULL, 'bbs-admin-group', '15,14,12,8'
  WHERE NOT EXISTS (SELECT 1 FROM bbs_root WHERE id = '__root__');
