# hono-bbs

Hono + Cloudflare Workers + D1 で動く匿名掲示板 API バックエンドです。

- **Runtime**: Cloudflare Workers
- **Framework**: [Hono](https://hono.dev/)
- **DB**: Cloudflare D1 (SQLite 互換)
- **Session**: Cloudflare KV
- **Bot 対策**: Cloudflare Turnstile

API 仕様の詳細は [`docs/endpoints/`](./docs/endpoints/) を参照してください。

---

## 目次

1. [ローカル開発手順](#ローカル開発手順)
2. [本番デプロイ手順](#本番デプロイ手順)
3. [環境変数一覧](#環境変数一覧)
4. [管理者初期設定](#管理者初期設定)
5. [デプロイチェックリスト](#デプロイチェックリスト)

---

## ローカル開発手順

### 1. リポジトリのセットアップ

```bash
git clone <this-repo>
cd hono-bbs
npm install
```

### 2. 設定ファイルのコピー

実際の設定ファイルは `.gitignore` で除外されています。
`*.example.*` ファイルをコピーして使用してください。

```bash
# Wrangler 設定
cp wrangler.example.jsonc wrangler.jsonc

# ローカル開発用環境変数
cp .dev.vars.example .dev.vars
```

### 3. `wrangler.jsonc` の編集

本番デプロイ用に D1 と KV の ID を設定します (ローカル開発のみなら不要)。

```jsonc
"kv_namespaces": [{ "binding": "SESSION_KV", "id": "<KV_NAMESPACE_ID>" }],
"d1_databases": [{ "binding": "DB", "database_name": "hono-bbs-db", "database_id": "<D1_DATABASE_ID>" }]
```

### 4. `.dev.vars` の編集

```ini
API_BASE_PATH=/api/v1
ADMIN_INITIAL_PASSWORD=your-local-password
# ENABLE_TURNSTILE は設定しない (ローカル開発時は Turnstile スキップ)
```

### 5. ローカル D1 の初期化

```bash
npx wrangler d1 execute hono-bbs-db --local --file=schema/init.sql
```

### 6. 開発サーバー起動

```bash
npm run dev
```

### 7. admin パスワードの初期設定

```bash
curl -X POST http://localhost:8787/api/v1/auth/setup
```

### 8. 動作確認

```bash
# ログイン
curl -X POST http://localhost:8787/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"id":"admin","password":"your-local-password"}'

# 板一覧
curl http://localhost:8787/api/v1/boards
```

> **補足**: ローカルの D1 データは `.wrangler/state/v3/d1/`、KV データは `.wrangler/state/v3/kv/` に保存されます。

---

## 本番デプロイ手順

### 前提条件

- Node.js 18 以上
- Cloudflare アカウント
- Wrangler CLI (`npx wrangler login` でログイン済み)

```bash
npm install
npx wrangler login
```

### 1. Cloudflare リソースの作成

#### D1 データベース

```bash
npx wrangler d1 create hono-bbs-db
# → database_id = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" をメモ
```

#### KV Namespace (セッション保存用)

```bash
npx wrangler kv namespace create SESSION_KV
# → id = "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" をメモ
```

### 2. `wrangler.jsonc` の設定

```bash
cp wrangler.example.jsonc wrangler.jsonc
```

取得した ID を `wrangler.jsonc` に設定します:

```jsonc
"kv_namespaces": [{ "binding": "SESSION_KV", "id": "<取得したKV ID>" }],
"d1_databases": [{ "binding": "DB", "database_name": "hono-bbs-db", "database_id": "<取得したD1 ID>" }]
```

必要に応じて `vars` に `CORS_ORIGIN` などを追加します:

```jsonc
"vars": {
  "API_BASE_PATH": "/api/v1",
  "CORS_ORIGIN": "https://your-frontend.pages.dev",
  "ENABLE_TURNSTILE": "true"
}
```

### 3. Secret の登録

機密情報は `wrangler secret put` で登録します (コマンド履歴に残りません)。

```bash
# admin 初期パスワード (8文字以上推奨)
npx wrangler secret put ADMIN_INITIAL_PASSWORD
```

> **注意**: Turnstile の設定 (`TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY`) は **turnstileApiToken プラグイン** 側で行います。hono-bbs 本体は `ENABLE_TURNSTILE=true` を設定するだけで連携できます。

### 4. D1 データベースの初期化

```bash
npx wrangler d1 execute hono-bbs-db --remote --file=schema/init.sql
```

> **警告**: `init.sql` はテーブルを DROP して再作成します。再実行するとすべてのデータが消えます。**初回のみ** 実行してください。

### 5. デプロイ

```bash
npx wrangler deploy
```

デプロイ後、`https://hono-bbs.<subdomain>.workers.dev` でアクセスできます。

### 6. admin 初期パスワードの設定 (初回のみ)

```bash
curl -X POST https://hono-bbs.<subdomain>.workers.dev/api/v1/auth/setup
```

成功レスポンス:
```json
{ "data": { "message": "Admin password has been set" } }
```

このエンドポイントは **一度しか成功しません** (2回目は `409 ALREADY_SETUP`)。

設定後は Secret を削除することを推奨します:

```bash
npx wrangler secret delete ADMIN_INITIAL_PASSWORD
```

---

## 環境変数一覧

| 変数名 | 必須 | 説明 | デフォルト |
|---|---|---|---|
| `ADMIN_INITIAL_PASSWORD` | ✓ | admin 初期パスワード (`POST /auth/setup` で使用、設定後は削除推奨) | — |
| `API_BASE_PATH` | — | API ベースパス | `/api/v1` |
| `CORS_ORIGIN` | — | 許可する CORS オリジン (カンマ区切り) | `*` |
| `BBS_ALLOW_DOMAIN` | — | 許可するドメイン — Host ヘッダーチェック (カンマ区切り) | 制限なし |
| `ENABLE_TURNSTILE` | — | `true` で `X-Turnstile-Session` を SESSION_KV で検証する | — (スキップ) |
| `ADMIN_USERNAME` | — | admin ユーザーID | `admin` |
| `USER_ADMIN_ROLE` | — | ユーザー管理ロールID | `user-admin-role` |
| `USER_DISPLAY_LIMIT` | — | ユーザー一覧の 1 ページあたり件数 (`0` = 無制限) | `0` |
| `ROLE_DISPLAY_LIMIT` | — | ロール一覧の 1 ページあたり件数 (`0` = 無制限) | `0` |
| `MAX_REQUEST_SIZE` | — | リクエストボディサイズ上限 (例: `"1mb"`, `"500kb"`) | 無制限 |
| `DELETED_POSTER_NAME` | — | ソフトデリート済み投稿の名前欄 | `あぼーん` |
| `DELETED_CONTENT` | — | ソフトデリート済み投稿の本文 | `このレスは削除されました` |
| `KV_PREFIX` | — | KV グローバルプレフィックス (複数インスタンス共存時) | — |

> Turnstile 関連の設定 (`TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY` 等) は **turnstileApiToken プラグイン** 側の設定です。詳細は [`docs/env-vars.md`](./docs/env-vars.md) を参照してください。

---

## 管理者初期設定

デプロイ後の初期設定手順です。詳細は [`docs/admin-operations.md`](./docs/admin-operations.md) を参照してください。

```bash
# 1. admin でログイン
curl -X POST <API_BASE>/auth/login \
  -H "Content-Type: application/json" \
  -d '{"id":"admin","password":"<ADMIN_INITIAL_PASSWORD>"}'

# 2. Turnstile セッションを取得 (ENABLE_TURNSTILE=true の場合)
# turnstileApiToken プラグインの GET /auth/turnstile でページを開き、チャレンジを通過してセッションIDを取得
# ENABLE_TURNSTILE を設定していない開発環境では X-Turnstile-Session は不要

# 3. 板を作成
curl -X POST <API_BASE>/boards \
  -H "Content-Type: application/json" \
  -H "X-Session-Id: <SESSION_ID>" \
  -H "X-Turnstile-Session: <TURNSTILE_SESSION_ID>" \
  -d '{"id":"general","name":"雑談","defaultIdFormat":"daily_hash","defaultPosterName":"名無しさん","maxThreads":1000,"defaultMaxPosts":500}'
```

---

## デプロイチェックリスト

初回デプロイ時は以下を順番に確認してください。

- [ ] `wrangler.example.jsonc` をコピーして `wrangler.jsonc` を作成した
- [ ] `wrangler.jsonc` に D1 の `database_id` を設定した
- [ ] `wrangler.jsonc` に KV の `id` を設定した
- [ ] `ADMIN_INITIAL_PASSWORD` を Secret として登録した
- [ ] `ENABLE_TURNSTILE=true` を vars に設定した (Turnstile を使用する場合)
- [ ] turnstileApiToken プラグインに `TURNSTILE_SECRET_KEY` / `TURNSTILE_SITE_KEY` を設定した (Turnstile を使用する場合)
- [ ] `npx wrangler d1 execute hono-bbs-db --remote --file=schema/init.sql` を実行した
- [ ] `npx wrangler deploy` を実行した
- [ ] `POST /auth/setup` を実行して admin パスワードを設定した
- [ ] admin でログインできることを確認した

---

## 開発コマンド

```bash
npm install         # 依存関係インストール
npm run dev         # Wrangler 開発サーバー起動 (http://localhost:8787)
npm run deploy      # 本番デプロイ
npm run cf-typegen  # Cloudflare bindings 型生成
```

---

## ライセンス

MIT
