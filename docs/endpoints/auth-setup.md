# エンドポイント: `/auth/setup`

ベースパス: `{API_BASE_PATH}/auth/setup`

## 概要

管理者ユーザの初期パスワードを設定する。**システム初期化時に一度だけ実行するエンドポイント。**

### 役割・実装の説明

`schema/init.sql` で挿入された管理者ユーザ (`ADMIN_USERNAME`、デフォルト: `admin`) は
`password_hash` が `__NEEDS_SETUP__` になっており、
このエンドポイントで環境変数 `ADMIN_INITIAL_PASSWORD` の値を使ってパスワードを設定する。

- 初期設定済みの場合は `409 ALREADY_SETUP` を返す (二重実行防止)
- `ADMIN_INITIAL_PASSWORD` が未設定の場合は `500 SETUP_NOT_CONFIGURED` を返す
- 一度設定した後のパスワード変更は `PUT /profile` で行うこと

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
  "data": {
    "message": "Setup completed"
  }
}
```

### エラー

| コード | HTTP | 説明 |
|---|---|---|
| `ALREADY_SETUP` | 409 | 初期設定済み (再実行不可) |
| `SETUP_NOT_CONFIGURED` | 500 | `ADMIN_INITIAL_PASSWORD` 環境変数が未設定 |
