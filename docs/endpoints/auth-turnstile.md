# エンドポイント: `/auth/turnstile`

ベースパス: `{API_BASE_PATH}/auth/turnstile`

## 概要

Cloudflare Turnstile による Bot 対策チャレンジを提供するエンドポイント。
GET でチャレンジ HTML ページを返し、POST でトークン検証・Turnstile セッション発行を行う。

### 役割・実装の説明

Turnstile セッションは、掲示板への書き込み・サインアップ・ログイン等の全 `POST/PUT/DELETE` 操作に必要な `X-Turnstile-Session` ヘッダーの値となる。

セッション ID は `hash(クライアントIP + UserAgent + YYYY-MM-DD UTC)` から生成されるため、
同一クライアントが同日中に再度リクエストした場合は既存のセッション ID を返す (KV 書き込みなし)。
セッションは KV (`SESSION_KV`) に保存され、24 時間有効。

`DISABLE_TURNSTILE=true` の場合、検証をスキップして固定値 `"dev-turnstile-disabled"` を返す (開発専用)。

`GET /auth/turnstile` のリクエスト `Referer` ヘッダが `ALLOW_BBS_UI_DOMAINS` に含まれるドメインの場合、
POST 認証成功後に元のページへ `?setTurnstileToken=<sessionId>` クエリパラメータ付きでリダイレクトする。

---

## `GET /auth/turnstile`

Cloudflare Turnstile チャレンジ用の HTML ページを返す。
ユーザがチャレンジを完了するとページ内 JS が自動的に `POST /auth/turnstile` を呼び出す。

### 認証

不要

### レスポンス

- `200 text/html` — Turnstile ウィジェットを含む HTML ページ

---

## `POST /auth/turnstile`

Cloudflare が発行した Turnstile トークンを検証し、セッション ID を発行する。

### 認証

不要

### リクエスト

```json
{
  "type": "object",
  "required": ["token"],
  "properties": {
    "token": {
      "type": "string",
      "description": "Cloudflare Turnstile が発行したトークン"
    }
  }
}
```

### レスポンス

- `200 OK`

```json
{
  "type": "object",
  "properties": {
    "data": {
      "type": "object",
      "properties": {
        "sessionId": {
          "type": "string",
          "description": "以後の POST/PUT/DELETE で X-Turnstile-Session に使用。24時間有効"
        },
        "alreadyIssued": {
          "type": "boolean",
          "description": "true の場合、本日同端末からすでに発行済みのセッションを返している"
        }
      }
    }
  }
}
```

- `302 Found` — `Referer` が `ALLOW_BBS_UI_DOMAINS` に含まれる場合、元のページへリダイレクト
  - `Location: <元のページURL>?setTurnstileToken=<sessionId>`

### エラー

| コード | HTTP | 説明 |
|---|---|---|
| `VALIDATION_ERROR` | 400 | `token` フィールドがない |
| `TURNSTILE_FAILED` | 400 | Cloudflare 検証失敗。レスポンスに `errorCodes: string[]` が付く |
| `SESSION_CREATE_FAILED` | 500 | KV への書き込み失敗 |

`TURNSTILE_FAILED` の `errorCodes` 例:
- `invalid-input-secret` — サーバのシークレットキーが不正
- `invalid-input-response` — トークンが期限切れ・不正
- `timeout-or-duplicate` — トークンが使用済み
- `hostname-mismatch` — サイトのドメイン設定不一致
