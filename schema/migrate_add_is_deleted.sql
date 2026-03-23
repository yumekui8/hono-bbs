-- posts テーブルに is_deleted カラムを追加するマイグレーション
-- 既存 DB に適用する場合はこのファイルを実行してください
--
-- Cloudflare D1:
--   npx wrangler d1 execute hono-bbs-db --file=schema/migrate_add_is_deleted.sql
--
-- SQLite / MySQL / PostgreSQL:
--   対応クライアントでこの SQL を実行してください

ALTER TABLE posts ADD COLUMN is_deleted INTEGER NOT NULL DEFAULT 0;
