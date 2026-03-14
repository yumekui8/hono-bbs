# エンドポイント: `/auth/setup`

ベースパス: `{API_BASE_PATH}/auth/setup`

## 概要

管理者ユーザの初期パスワードを設定する。

### 役割・実装の説明

システム初期化時に一度だけ実行するエンドポイント。
`init.sql` で挿入された管理者ユーザ (`ADMIN_USERNAME`、デフォルト: `admin`) は
`password_hash` が `__NEEDS_SETUP__` になっており、
このエンドポイントで環境変数 `ADMIN_INITIAL_PASSWORD` の値を使ってパスワードを設定する。

初期設定済みの場合は `409 ALREADY_SETUP` を返す。
`ADMIN_INITIAL_PASSWORD` が未設定の場合は `500 SETUP_NOT_CONFIGURED` を返す。

一度設定した後は `PUT /profile` の `currentPassword`/`newPassword` で変更すること。

---

## `GET /auth/setup`

このエンドポイント自体の権限情報を返す。

### レスポンス

- `200 OK` — `{ "data": { "ownerUserId": "...", "ownerGroupId": "...", "permissions": "..." } }`

---

## `POST /auth/setup`

管理者ユーザの初期パスワードを設定する。一回限り。

### 認証

不要

### リクエスト

リクエストボディなし。環境変数 `ADMIN_INITIAL_PASSWORD` の値を使用する。

### レスポンス

- `200 OK`

```json
{
  "type": "object",
  "properties": {
    "data": {
      "type": "object",
      "properties": {
        "message": { "type": "string" }
      }
    }
  }
}
```

### エラー

| コード | HTTP | 説明 |
|---|---|---|
| `ALREADY_SETUP` | 409 | 初期設定済み |
| `SETUP_NOT_CONFIGURED` | 500 | `ADMIN_INITIAL_PASSWORD` 環境変数が未設定 |
