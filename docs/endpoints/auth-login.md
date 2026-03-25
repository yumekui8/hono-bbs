# エンドポイント: `/auth/login`

ベースパス: `{API_BASE_PATH}/auth/login`

## 概要

ユーザ ID とパスワードでログインし、ユーザセッションを発行する。

### 役割・実装の説明

ログイン成功時はセッション ID を KV (`SESSION_KV`) に保存し、クライアントへ返す。
セッションは 24 時間有効。

返されたセッション ID は以後のリクエストで `X-Session-Id` ヘッダーとして使用する。
`isActive: false` のアカウントはログイン不可。

Turnstile セッション (`X-Turnstile-Session`) が必要なため、
事前に `POST /auth/turnstile` でセッションを取得しておく必要がある。

---

## `POST /auth/login`

ログインしてセッションを発行する。

### 認証

- `X-Turnstile-Session` 必須

### リクエスト

```json
{
  "type": "object",
  "required": ["id", "password"],
  "properties": {
    "id": {
      "type": "string",
      "description": "ログインID"
    },
    "password": {
      "type": "string",
      "description": "パスワード"
    }
  }
}
```

### レスポンス

- `200 OK`

```json
{
  "data": {
    "sessionId":   "string  // X-Session-Id に使用。24時間有効",
    "userId":      "string",
    "displayName": "string",
    "expiresAt":   "string  // ISO 8601 形式"
  }
}
```

### エラー

| コード | HTTP | 説明 |
|---|---|---|
| `VALIDATION_ERROR` | 400 | バリデーション失敗 |
| `UNAUTHORIZED` | 401 | Turnstile セッション無効 |
| `INVALID_CREDENTIALS` | 401 | ID またはパスワードが誤り、またはアカウントが無効 (`isActive: false`) |
| `TOO_MANY_ATTEMPTS` | 429 | 短時間にログイン失敗が多すぎる (15分間で10回失敗でロック) |
