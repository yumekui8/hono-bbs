# turnstileApiToken Plugin

Cloudflare Turnstile トークン検証 & セッション発行エンドポイントを独立した Cloudflare Worker として提供するプラグインです。

hono-bbs 本体と同じ `SESSION_KV` を共有することで、発行したセッションを hono-bbs の Turnstile 検証ミドルウェアがそのまま利用できます。

## ファイル構成

```
plugins/turnstileApiToken/
  src/
    index.ts       # Worker エントリポイント (ドメイン制限・CORS)
    handler.ts     # GET/POST ハンドラ (HTML ページ・トークン検証)
    service.ts     # issueTurnstileSession ロジック
    repository.ts  # KV 読み書き
    types.ts       # PluginEnv 型定義
  wrangler.example.jsonc  # wrangler 設定のテンプレート
```

## セットアップ

### 1. wrangler.jsonc を作成

```bash
cp wrangler.example.jsonc wrangler.jsonc
```

`wrangler.jsonc` を編集して以下を設定してください。

| 設定項目 | 説明 |
|---|---|
| `kv_namespaces[].id` | hono-bbs 本体と **同じ** SESSION_KV のネームスペースID |
| `routes[].pattern` | デプロイ先のドメインとパス |
| `vars.TURNSTILE_SITE_KEY` | Cloudflare Turnstile サイトキー |
| `vars.TURNSTILE_PATH` | このWorkerが応答するパス (routes と合わせる) |

### 2. シークレットを設定

```bash
wrangler secret put TURNSTILE_SECRET_KEY
```

### 3. デプロイ

```bash
wrangler deploy
```

## 環境変数

| 変数名 | 必須 | デフォルト | 説明 |
|---|---|---|---|
| `SESSION_KV` | ✅ | - | KV ネームスペース (hono-bbs と同じものを共有) |
| `TURNSTILE_SITE_KEY` | ✅ | - | Cloudflare Turnstile サイトキー |
| `TURNSTILE_SECRET_KEY` | ✅ | - | Cloudflare Turnstile シークレットキー |
| `TURNSTILE_PATH` | | `/auth/turnstile` | エンドポイントのパス |
| `TURNSTILE_TOKEN_TTL` | | `525600` (1年) | セッション有効期限 (分, 0=無期限) |
| `ALLOW_BBS_UI_DOMAINS` | | - | 認証後リダイレクト許可ドメイン (カンマ区切り) |
| `BBS_ALLOW_DOMAIN` | | - | 受け付けるHostドメイン (カンマ区切り、未設定=制限なし) |
| `CORS_ORIGIN` | | `*` | 許可オリジン (カンマ区切り) |
| `DISABLE_TURNSTILE` | | - | `true` で Turnstile 検証をスキップ (開発用) |

## エンドポイント

### GET `<TURNSTILE_PATH>`

Turnstile ウィジェットを含む HTML ページを返します。

クエリパラメータ:
- `returnTo` — 認証後のリダイレクト先URL (ALLOW_BBS_UI_DOMAINS に含まれる必要あり)

### POST `<TURNSTILE_PATH>`

Turnstile トークンを検証してセッションIDを発行します。

リクエスト:
```json
{ "token": "<turnstile-token>" }
```

レスポンス:
```json
{ "data": { "sessionId": "...", "alreadyIssued": false } }
```

発行した `sessionId` は `X-Turnstile-Session` ヘッダーとして hono-bbs API に渡してください。

## hono-bbs との連携

このプラグインと hono-bbs 本体は **SESSION_KV を共有** することで連携します。

```
[ブラウザ] → GET/POST <TURNSTILE_PATH>  → [このWorker]
                                               ↓ KV書き込み
[ブラウザ] → POST /api/v1/boards/:id    → [hono-bbs Worker]
              X-Turnstile-Session: xxx       ↓ KV読み込みで検証
```

Cloudflare Workers の仕様上、同一ドメイン・同一パスに2つのWorkerをデプロイすることはできません。
このプラグインを hono-bbs と **同じドメイン** で使う場合は、パスを分ける (例: `/turnstile` vs `/api/v1`) か、**Service Bindings** で hono-bbs 内から呼び出す構成を検討してください。
