-- v1 → v2 マイグレーション
-- 既存データ (boards / threads / posts) を保持しながら users テーブルを更新する
-- 使い方 (本番): npx wrangler d1 execute hono-bbs-db --remote --file=schema/migrate_v2.sql
-- 使い方 (ローカル): npx wrangler d1 execute hono-bbs-db --local --file=schema/migrate_v2.sql

-- 1. 新カラムを追加
ALTER TABLE users ADD COLUMN display_name TEXT NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN bio TEXT;
ALTER TABLE users ADD COLUMN email TEXT;
ALTER TABLE users ADD COLUMN is_active INTEGER NOT NULL DEFAULT 1;
ALTER TABLE users ADD COLUMN updated_at TEXT NOT NULL DEFAULT '2024-01-01T00:00:00.000Z';

-- 2. username の値を display_name にコピーし、updated_at を created_at に合わせる
UPDATE users SET display_name = username, updated_at = created_at;

-- 3. username カラムを削除 (Cloudflare D1 / SQLite 3.35+ でサポート)
ALTER TABLE users DROP COLUMN username;
