# セットアップ・デプロイガイド

hono-bbs 本体の開発環境構築・本番デプロイ・DB 初期化の手順書です。

プラグインのデプロイ手順は各プラグインのドキュメントを参照してください。
- turnstileApiToken: `plugins/turnstileApiToken/README.md`
- imageUploader: `docs/plugins/imageUploader/deployment.md`

---

## 前提条件

- Node.js 18 以上
- npm
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/) (`npm install` で自動インストールされる)
- Cloudflare アカウント

---

## ローカル開発環境

### 1. 依存関係のインストール

```bash
npm install
```

### 2. wrangler.jsonc を作成

```bash
cp wrangler.example.jsonc wrangler.jsonc
```

### 3. D1 データベースを作成・初期化

```bash
# ローカル D1 を初期化 (wrangler.jsonc の database_id 設定前でも実行可能)
wrangler d1 execute hono-bbs-db --local --file=schema/init.sql
```

### 4. KV ネームスペースを作成

```bash
wrangler kv namespace create SESSION_KV --local
```

ローカル開発では KV の ID 設定は不要です（wrangler が自動管理）。

### 5. 環境変数を設定

```bash
cp .dev.vars.example .dev.vars
```

`.dev.vars` を開いて必要な値を設定します。最低限 `ADMIN_INITIAL_PASSWORD` の設定が必要です。

```bash
# .dev.vars の最小設定例
ADMIN_INITIAL_PASSWORD=your-local-password
CORS_ORIGIN=http://localhost:5173
```

### 6. 開発サーバーを起動

```bash
npm run dev
# → http://localhost:8787 で起動
```

### 7. admin 初期設定

初回起動後、admin ユーザーのパスワードをセットアップします。

```bash
curl -X POST http://localhost:8787/api/v1/auth/setup \
  -H "Content-Type: application/json" \
  -d '{"password":"your-local-password"}'
```

### 8. ログインを確認

```bash
curl -X POST http://localhost:8787/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"id":"admin","password":"your-local-password"}'
```

レスポンスの `sessionId` を `X-Session-Id` ヘッダーに使ってAPIを操作できます。

---

## 本番デプロイ

### 1. Cloudflare にログイン

```bash
wrangler login
```

### 2. D1 データベースを作成

```bash
wrangler d1 create hono-bbs-db
```

出力された `database_id` を `wrangler.jsonc` の `d1_databases[].database_id` に設定します。

```jsonc
"d1_databases": [
  {
    "binding": "DB",
    "database_name": "hono-bbs-db",
    "database_id": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"  // ← ここに設定
  }
]
```

### 3. KV ネームスペースを作成

```bash
wrangler kv namespace create SESSION_KV
```

出力された `id` を `wrangler.jsonc` の `kv_namespaces[].id` に設定します。

```jsonc
"kv_namespaces": [
  {
    "binding": "SESSION_KV",
    "id": "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"  // ← ここに設定
  }
]
```

### 4. シークレットを設定

```bash
wrangler secret put ADMIN_INITIAL_PASSWORD   # admin 初期パスワード
wrangler secret put CORS_ORIGIN              # 許可するフロントエンドのオリジン
```

必要に応じて追加設定:

```bash
wrangler secret put ENABLE_TURNSTILE         # 'true' で Turnstile 検証を有効化
wrangler secret put BBS_ALLOW_DOMAIN         # 許可するドメイン (カンマ区切り)
```

### 5. D1 を本番環境で初期化

```bash
wrangler d1 execute hono-bbs-db --remote --file=schema/init.sql
```

### 6. デプロイ

```bash
wrangler deploy
```

### 7. admin 初期設定

```bash
curl -X POST https://your-worker.your-subdomain.workers.dev/api/v1/auth/setup \
  -H "Content-Type: application/json" \
  -d '{"password":"<ADMIN_INITIAL_PASSWORD に設定した値>"}'
```

成功したら `ADMIN_INITIAL_PASSWORD` を削除します（再実行不可のため保持不要）。

```bash
wrangler secret delete ADMIN_INITIAL_PASSWORD
```

---

## DB の初期化・リセット

### ローカル環境をリセット

```bash
# テーブルを削除して再作成
wrangler d1 execute hono-bbs-db --local --file=schema/init.sql
```

`schema/init.sql` の先頭に `DROP TABLE IF EXISTS` が含まれているため、冪等に実行できます。

### 本番環境をリセット

> **注意**: 本番データがすべて消えます。

```bash
wrangler d1 execute hono-bbs-db --remote --file=schema/init.sql
```

リセット後は必ず admin 初期設定 (`POST /auth/setup`) を再実行してください。

### DB の内容を確認

```bash
# ローカル
wrangler d1 execute hono-bbs-db --local --command "SELECT * FROM users;"

# 本番
wrangler d1 execute hono-bbs-db --remote --command "SELECT * FROM users;"
```

### DB のバックアップ

```bash
wrangler d1 export hono-bbs-db --remote --output=backup-$(date +%Y%m%d).sql
```

---

## 型生成

Cloudflare の binding 型定義を生成します（`wrangler.jsonc` を変更した後に実行）。

```bash
npm run cf-typegen
```

---

## 環境変数一覧

`.dev.vars`（ローカル）または `wrangler secret put`（本番）で設定します。

| 変数名 | 必須 | デフォルト | 説明 |
|---|---|---|---|
| `ADMIN_INITIAL_PASSWORD` | ✅ | — | admin 初期パスワード。`POST /auth/setup` で使用後は削除推奨 |
| `CORS_ORIGIN` | ✅ | `*` | 許可する CORS オリジン (カンマ区切り) |
| `ENABLE_TURNSTILE` | | — | `true` で `X-Turnstile-Session` を SESSION_KV で検証する |
| `ADMIN_USERNAME` | | `admin` | 管理者ユーザID |
| `USER_ADMIN_GROUP` | | `user-admin-group` | ユーザ管理グループID |
| `BBS_ADMIN_GROUP` | | `bbs-admin-group` | 掲示板管理グループID |
| `API_BASE_PATH` | | `/api/v1` | API ベースパス |
| `BBS_ALLOW_DOMAIN` | | — | 許可するホストドメイン (カンマ区切り、未設定で制限なし) |
| `MAX_REQUEST_SIZE` | | — | リクエストボディサイズ上限 (例: `1mb`, `500kb`) |
| `ENDPOINT_PERMISSIONS` | | — | エンドポイント権限 JSON (省略時はデフォルト値を使用) |
| `USER_DISPLAY_LIMIT` | | `0` | ユーザ一覧の1ページあたり件数 (0=無制限) |
| `GROUP_DISPLAY_LIMIT` | | `0` | グループ一覧の1ページあたり件数 (0=無制限) |

> Turnstile 関連の設定 (`TURNSTILE_SITE_KEY` 等) は **turnstileApiToken プラグイン** 側の設定です。
> hono-bbs 本体は `ENABLE_TURNSTILE` と `SESSION_KV` binding のみを参照します。

---

## ディレクトリ構造

```
hono-bbs/
  src/
    index.ts          # エントリポイント
    routes/           # Hono ルーティング定義
    handlers/         # HTTPリクエスト処理
    services/         # ビジネスロジック
    repository/       # DB アクセス
    middleware/       # 認証・ドメイン制限
    types/            # 型定義
    utils/            # 汎用関数
  schema/
    init.sql          # DB 初期化 SQL (DROP + CREATE + 初期データ)
    *.sql             # テーブル別スキーマ (参照用)
  docs/
    setup.md          # このファイル
    admin-operations.md
    endpoints/        # API エンドポイント仕様書
    plugins/          # プラグイン仕様書
  plugins/
    turnstileApiToken/  # Turnstile セッション発行プラグイン
    imageUploader/      # 画像アップロードプラグイン
  wrangler.example.jsonc  # wrangler 設定テンプレート
  .dev.vars.example       # ローカル環境変数テンプレート
```

---

## トラブルシューティング

### `POST /auth/setup` が `ALREADY_SETUP` を返す

すでに admin パスワードが設定済みです。ログインして操作してください。

### ローカルで KV が使えない

`wrangler dev` は KV をローカルファイルで自動シミュレートします。特別な設定は不要です。

### CORS エラーが出る

`.dev.vars` の `CORS_ORIGIN` にフロントエンドのオリジン（例: `http://localhost:5173`）が含まれているか確認してください。

### D1 に接続できない

`wrangler.jsonc` の `database_id` が正しいか確認してください。ローカルであれば `--local` フラグを使って実行しているか確認してください。

### 型エラーが出る

```bash
npm run cf-typegen
```

を実行して binding 型定義を再生成してください。
