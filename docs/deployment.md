# デプロイ・運用ガイド

このドキュメントは hono-bbs を Cloudflare Workers へデプロイし、
初回セットアップを完了するまでの手順と、管理者の日常運用方法を説明します。

---

## 前提条件

- [Node.js](https://nodejs.org/) 18 以上
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/) (プロジェクトに devDependency として含まれている)
- Cloudflare アカウント

```bash
npm install          # 依存関係インストール
npx wrangler login   # Cloudflare アカウントにログイン
```

---

## 1. Cloudflare リソースの作成

### 1-1. D1 データベースの作成

```bash
npx wrangler d1 create hono-bbs-db
```

出力例:
```
✅ Successfully created DB 'hono-bbs-db'
database_id = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
```

`wrangler.jsonc` の `d1_databases[].database_id` に取得した ID を設定します。

```jsonc
"d1_databases": [
  {
    "binding": "DB",
    "database_name": "hono-bbs-db",
    "database_id": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"  // ← ここを書き換え
  }
]
```

### 1-2. KV Namespace の作成

セッション情報 (ログインセッション・Turnstile セッション) の保存先として使用します。

```bash
npx wrangler kv namespace create SESSION_KV
```

出力例:
```
✅ Successfully created KV namespace 'SESSION_KV'
id = "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
```

`wrangler.jsonc` の `kv_namespaces[].id` に取得した ID を設定します。

```jsonc
"kv_namespaces": [
  {
    "binding": "SESSION_KV",
    "id": "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"  // ← ここを書き換え
  }
]
```

---

## 2. D1 データベースの初期化

スキーマとシステムユーザー・グループの初期データを投入します。

```bash
# 本番 D1 に適用 (--remote フラグが必要)
npx wrangler d1 execute hono-bbs-db --remote --file=schema/init.sql
```

> **注意**: `init.sql` は既存のテーブルを DROP してから再作成します。
> 本番で再実行するとすべてのデータが消えます。
> 通常は **初回のみ** 実行してください。

実行後のテーブル構成:

| テーブル | 用途 |
|---|---|
| `groups` | グループ (sys-* システムグループを含む) |
| `users` | ユーザー (sys-admin を含む) |
| `user_groups` | ユーザーとグループの所属関係 |
| `boards` | 掲示板 |
| `threads` | スレッド |
| `posts` | 投稿 |

セッション系 (`sessions`, `turnstile_sessions`) は D1 ではなく KV で管理するため、テーブルは作成されません。

---

## 3. 環境変数 (Secrets) の設定

本番環境では `.dev.vars` は使用されません。
Cloudflare Dashboard または Wrangler の `secret` コマンドで管理します。

### 設定が必要な変数一覧

| 変数名 | 用途 | 機密度 |
|---|---|---|
| `ADMIN_INITIAL_PASSWORD` | admin 初期パスワード設定用 | **Secret** |
| `TURNSTILE_SECRET_KEY` | Turnstile 検証用シークレット | **Secret** |
| `TURNSTILE_SITE_KEY` | フロントエンド用サイトキー | vars (非機密) |
| `DISABLE_TURNSTILE` | Turnstile 無効化フラグ | vars (開発用のみ) |
| `API_BASE_PATH` | API ベースパス | vars (wrangler.jsonc で管理) |

### Secret の登録 (Wrangler CLI)

機密情報は `wrangler secret put` で登録します。値はインタラクティブに入力するため、コマンド履歴や CI ログに残りません。

```bash
npx wrangler secret put ADMIN_INITIAL_PASSWORD
# プロンプトに admin の初期パスワードを入力 (8文字以上推奨)

npx wrangler secret put TURNSTILE_SECRET_KEY
# プロンプトに Cloudflare Turnstile シークレットキーを入力
```

### 非機密変数の登録 (wrangler.jsonc)

`TURNSTILE_SITE_KEY` はフロントエンドに公開されるキーのため、
`wrangler.jsonc` の `vars` に記載しても構いません。

```jsonc
"vars": {
  "API_BASE_PATH": "/api/v1",
  "TURNSTILE_SITE_KEY": "0x4AAAAAACxxxxxxxxxxxxxxxxxxxxxx"
}
```

> **注意**: `DISABLE_TURNSTILE=true` は **本番環境では絶対に設定しないこと**。
> これを設定すると Turnstile 認証が完全にスキップされ、bot 投稿が可能になります。

### Cloudflare Dashboard での確認・編集

1. [Cloudflare Dashboard](https://dash.cloudflare.com/) にログイン
2. Workers & Pages → `hono-bbs` を選択
3. Settings → Variables and Secrets

Secret は一度登録すると値を確認できません (上書きは可能)。

---

## 4. デプロイ

```bash
npx wrangler deploy
```

デプロイ成功後、`https://hono-bbs.<your-subdomain>.workers.dev` でアクセスできます。

カスタムドメインを使用する場合は Dashboard の Workers & Pages → `hono-bbs` → Settings → Domains & Routes で設定します。

---

## 5. admin 初期パスワードの設定 (初回のみ)

デプロイ後、`sys-admin` ユーザーのパスワードは `__NEEDS_SETUP__` のままです。
`POST /auth/setup` を一度だけ呼び出して初期化します。

```bash
curl -X POST https://hono-bbs.<your-subdomain>.workers.dev/api/v1/auth/setup
```

成功レスポンス:
```json
{ "data": { "message": "Admin password has been set" } }
```

設定に使われるパスワードは環境変数 `ADMIN_INITIAL_PASSWORD` の値です。
**このエンドポイントは一度しか成功しません** (2回目は `409 ALREADY_SETUP`)。

> **セキュリティ上の注意**:
> - パスワード設定後は `ADMIN_INITIAL_PASSWORD` の Secret を削除することを推奨します。
> - 削除方法: `npx wrangler secret delete ADMIN_INITIAL_PASSWORD`

---

## 6. 動作確認

```bash
# 板一覧 (空のはず)
curl https://hono-bbs.<your-subdomain>.workers.dev/api/v1/boards

# admin でログイン
curl -X POST https://hono-bbs.<your-subdomain>.workers.dev/api/v1/auth/signin \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"<your-admin-password>"}'
```

---

## 7. Cloudflare Turnstile の設定

Turnstile は bot 対策のための CAPTCHA サービスです。

### サイトキーとシークレットキーの取得

1. [Cloudflare Dashboard](https://dash.cloudflare.com/) → Turnstile
2. 「サイトを追加」→ サイト名とドメインを入力
3. **サイトキー** (`TURNSTILE_SITE_KEY`) と **シークレットキー** (`TURNSTILE_SECRET_KEY`) を取得

テスト用キー (常に成功する):
- サイトキー: `1x00000000000000000000AA`
- シークレットキー: `1x0000000000000000000000000000000AA`

本番環境では必ず実際のキーを使用してください。

---

## ローカル開発手順

```bash
# 1. 環境変数設定
cp .dev.vars.example .dev.vars
# .dev.vars を編集

# 2. ローカル D1 を初期化
npx wrangler d1 execute hono-bbs-db --local --file=schema/init.sql

# 3. 開発サーバー起動
npm run dev

# 4. admin パスワード設定
curl -X POST http://localhost:8787/api/v1/auth/setup

# 5. ログイン確認
curl -X POST http://localhost:8787/api/v1/auth/signin \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"<.dev.vars の ADMIN_INITIAL_PASSWORD>"}'
```

ローカルの D1 データは `.wrangler/state/v3/d1/` に、
KV データは `.wrangler/state/v3/kv/` に保存されます。

---

## データの再初期化 (本番)

> **警告**: 以下の操作はすべてのデータを削除します。実行前に必ずバックアップを取ってください。

### D1 のリセット

```bash
npx wrangler d1 execute hono-bbs-db --remote --file=schema/init.sql
# その後 /auth/setup を再実行してadminパスワードを再設定
```

### KV のクリア

KV にはセッションデータのみが入っています (TTL で自動失効するため通常クリア不要)。
手動でクリアする場合は Dashboard から操作します。

1. Cloudflare Dashboard → Storage & Databases → KV
2. `SESSION_KV` を選択 → すべてのキーを削除

---

## デプロイチェックリスト

初回デプロイ時は以下を順番に確認してください。

- [ ] `wrangler.jsonc` に D1 の `database_id` を設定した
- [ ] `wrangler.jsonc` に KV の `id` を設定した
- [ ] `ADMIN_INITIAL_PASSWORD` を Secret として登録した
- [ ] `TURNSTILE_SECRET_KEY` を Secret として登録した
- [ ] `TURNSTILE_SITE_KEY` を vars に設定した
- [ ] `DISABLE_TURNSTILE` が **設定されていない** ことを確認した
- [ ] `npx wrangler d1 execute hono-bbs-db --remote --file=schema/init.sql` を実行した
- [ ] `npx wrangler deploy` を実行した
- [ ] `POST /auth/setup` を実行して admin パスワードを設定した
- [ ] admin でログインできることを確認した
