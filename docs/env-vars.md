# 環境変数リファレンス

hono-bbs 本体および全プラグインの環境変数を一覧化したリファレンスです。

---

## hono-bbs 本体

### Cloudflare Workers バインディング (wrangler.jsonc / wrangler.example.jsonc)

| 変数名 | 種別 | 必須 | 説明 |
|---|---|---|---|
| `DB` | D1 binding | ✅ | Cloudflare D1 データベース |
| `SESSION_KV` | KV binding | ✅ | セッション・Turnstile トークン保存先 KV |

### vars (wrangler.jsonc の vars / .dev.vars)

| 変数名 | デフォルト | 説明 |
|---|---|---|
| `API_BASE_PATH` | `/api/v1` | API ベースパス |
| `CORS_ORIGIN` | `*` | 許可する CORS オリジン (カンマ区切り) |
| `BBS_ALLOW_DOMAIN` | *(制限なし)* | 許可するドメイン (カンマ区切り) |
| `USER_DISPLAY_LIMIT` | `0` (無制限) | ユーザ一覧の 1 ページあたり件数 |
| `GROUP_DISPLAY_LIMIT` | `0` (無制限) | グループ一覧の 1 ページあたり件数 |
| `MAX_REQUEST_SIZE` | *(無制限)* | リクエストサイズ上限 (例: `1mb`, `500kb`) |

### secrets (wrangler secret put で設定)

| 変数名 | 必須 | 説明 |
|---|---|---|
| `ADMIN_INITIAL_PASSWORD` | ✅ | admin 初期パスワード (`POST /auth/setup` で使用、設定後は削除推奨) |
| `ENABLE_TURNSTILE` | | `"true"` で Turnstile セッション検証を有効化 (未設定時は検証スキップ) |
| `DELETED_POSTER_NAME` | | ソフトデリート済み投稿の名前欄 (デフォルト: `あぼーん`) |
| `DELETED_CONTENT` | | ソフトデリート済み投稿の本文 (デフォルト: `このレスは削除されました`) |
| `KV_PREFIX` | | KV グローバルプレフィックス (複数インスタンス共存時のキー衝突防止、例: `prod:`) |
| `ADMIN_USERNAME` | | 管理者ユーザ ID (デフォルト: `admin`、変更時は `init.sql` も変更) |
| `USER_ADMIN_GROUP` | | ユーザ管理グループ ID (デフォルト: `user-admin-group`) |
| `BBS_ADMIN_GROUP` | | 掲示板管理グループ ID (デフォルト: `bbs-admin-group`) |
| `ENDPOINT_PERMISSIONS` | | エンドポイント権限設定 (JSON 形式、省略時はデフォルト値を使用) |

### Node.js 環境 (Linux サーバー等)

Cloudflare Workers バインディングの代替として、以下の環境変数でアダプターを設定します。

| 変数名 | デフォルト | 説明 |
|---|---|---|
| `DB_DRIVER` | `sqlite` | DB ドライバー: `mysql` / `postgresql` / `sqlite` |
| `DATABASE_URL` | `./local.db` | DB 接続文字列 (例: `mysql://user:pass@host:3306/dbname`) |
| `KV_DRIVER` | `memory` | KV ドライバー: `redis` / `memory` |
| `REDIS_URL` | `redis://localhost:6379` | Redis 接続文字列 (`KV_DRIVER=redis` 時) |
| `KV_PREFIX` | *(なし)* | KV グローバルプレフィックス (Workers と共通) |
| `PORT` | `8787` | リスンポート |
| `NODE_ENV` | `development` | 環境名 |

必要な npm パッケージ (用途に応じてインストール):

```bash
npm install mysql2          # MySQL 使用時
npm install pg              # PostgreSQL 使用時
npm install better-sqlite3  # SQLite 使用時 (デフォルト)
npm install ioredis         # Redis 使用時
npm install @hono/node-server  # Node.js サーバー用
```

---

## plugins/turnstileApiToken

| 変数名 | 種別 | 必須 | デフォルト | 説明 |
|---|---|---|---|---|
| `SESSION_KV` | KV binding | ✅ | | Turnstile トークン保存先 KV (hono-bbs 本体と共有可) |
| `TURNSTILE_SITE_KEY` | vars | ✅ | | Cloudflare Turnstile サイトキー (公開値) |
| `TURNSTILE_SECRET_KEY` | secret | ✅ | | Cloudflare Turnstile シークレットキー |
| `TURNSTILE_TOKEN_TTL` | vars | | `525600` (1年) | トークン有効期限 (分単位、`0` = 無期限) |
| `DISABLE_TURNSTILE` | vars | | | `"true"` で Turnstile 検証をスキップ (ローカル開発用のみ) |
| `ALLOW_BBS_UI_DOMAINS` | vars | | *(リダイレクトなし)* | 認証後リダイレクト許可 UI ドメイン (カンマ区切り、`?returnTo=` と組み合わせて使用) |
| `BBS_ALLOW_DOMAIN` | vars | | *(制限なし)* | 許可するドメイン (カンマ区切り) |
| `CORS_ORIGIN` | vars | | `*` | 許可する CORS オリジン |
| `KV_PREFIX` | vars | | *(なし)* | KV グローバルプレフィックス |

---

## plugins/twoCh

### Cloudflare Workers バインディング

| 変数名 | 種別 | 必須 | 説明 |
|---|---|---|---|
| `BBS_DB` | D1 binding | ✅ | hono-bbs 本体と **同じ** D1 データベース |
| `SESSION_KV` | KV binding | ✅ (Turnstile 有効時) | edge-token 保存先 KV (hono-bbs 本体と共有可) |

### vars / secrets

| 変数名 | 必須 | デフォルト | 説明 |
|---|---|---|---|
| `SITE_URL` | | `Host` ヘッダーから自動生成 | このWorkerの公開URL (bbsmenu リンク生成に使用、例: `https://2ch.example.com`) |
| `BBS_NAME` | | `掲示板` | bbsmenu のタイトルに表示するサイト名 |
| `CORS_ORIGIN` | | `*` | 許可する CORS オリジン (カンマ区切り) |
| `ENABLE_TURNSTILE` | | `false` | `"true"` で書き込み時に Turnstile 認証を必須とする |
| `TURNSTILE_SITE_KEY` | | | Cloudflare Turnstile サイトキー (公開値) |
| `TURNSTILE_SECRET_KEY` | secret | | Cloudflare Turnstile シークレットキー |
| `THREAD_OWNER_USER` | | `null` | スレッド作成時の `owner_user_id` |
| `THREAD_OWNER_GROUP` | | `null` | スレッド作成時の `owner_group_id` |
| `POST_OWNER_USER` | | `null` | 投稿作成時の `owner_user_id` |
| `POST_OWNER_GROUP` | | `null` | 投稿作成時の `owner_group_id` |
| `KV_PREFIX` | | *(なし)* | KV グローバルプレフィックス (hono-bbs 本体と KV を共有する場合に衝突防止) |

---

## KV キー設計

複数サービスで同一 KV ネームスペースを共有する際は `KV_PREFIX` で衝突を防ぎます。

| サービス | キープレフィックス | 例 |
|---|---|---|
| hono-bbs 本体 (セッション) | `session:` | `session:abc123` |
| hono-bbs 本体 (Turnstile) | `turnstile:` | `turnstile:xyz789` |
| twoCh (edge-token) | `edge_token:` | `edge_token:uuid-...` |
| グローバル (インスタンス分離) | `KV_PREFIX` | `prod:session:abc123` |

`KV_PREFIX` は全サービスで同じ値を設定する必要があります。

---

## オブジェクトストレージ (plugins/imageUploader)

| 変数名 | 種別 | デフォルト | 説明 |
|---|---|---|---|
| `IMAGE_BUCKET` | R2 binding | | Cloudflare R2 バケット |
| `S3_ENDPOINT` | vars | | S3 互換エンドポイント (MinIO 等) |
| `S3_ACCESS_KEY_ID` | secret | | S3 アクセスキー ID |
| `S3_SECRET_ACCESS_KEY` | secret | | S3 シークレットアクセスキー |
| `S3_BUCKET` | vars | | S3 バケット名 |
| `S3_REGION` | vars | `auto` | S3 リージョン |
| `STORAGE_DRIVER` | vars | `r2` | ストレージドライバー: `r2` / `s3` |
