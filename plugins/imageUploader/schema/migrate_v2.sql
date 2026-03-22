-- Migration v2: delete_token カラム追加
-- 実行方法:
--   wrangler d1 execute <DB_NAME> --file=schema/migrate_v2.sql
--   wrangler d1 execute <DB_NAME> --file=schema/migrate_v2.sql --remote  (本番)

ALTER TABLE images ADD COLUMN delete_token TEXT;
