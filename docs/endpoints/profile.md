# エンドポイント: `/profile`

ベースパス: `{API_BASE_PATH}/profile`

## 概要

ログイン中のユーザ自身のプロフィール情報を取得・更新・削除する。
自分自身のデータのみ操作可能。他ユーザの操作は `/identity/users/:id` を使用する。

### 役割・実装の説明

`X-Session-Id` から現在のユーザを特定し、そのユーザのみ操作できる。
`id` (ログインID) および `isActive` フラグは変更不可。
パスワード変更は `PUT /profile` の `currentPassword`/`newPassword` フィールドで行う。
アカウント削除後も投稿は残り、`userId` が `null` になる。
管理者ユーザ (`admin`) は削除不可。

---

## `GET /profile`

ログイン中のユーザ自身の情報を取得する。
`endpoint` フィールドに `/profile` エンドポイントの権限情報が含まれる。

### 認証

- `X-Session-Id` 必須

### レスポンス

- `200 OK`

```json
{
  "type": "object",
  "properties": {
    "data": {
      "type": "object",
      "properties": {
        "id":             { "type": "string", "description": "ログインID兼表示ID。変更不可" },
        "displayName":    { "type": "string" },
        "bio":            { "type": ["string", "null"] },
        "email":          { "type": ["string", "null"] },
        "isActive":       { "type": "boolean" },
        "primaryGroupId": { "type": ["string", "null"] },
        "createdAt":      { "type": "string", "format": "date-time" },
        "updatedAt":      { "type": "string", "format": "date-time" }
      }
    },
    "endpoint": {
      "type": "object",
      "description": "/profile エンドポイントの ownership 情報"
    }
  }
}
```

### エラー

| コード | HTTP | 説明 |
|---|---|---|
| `UNAUTHORIZED` | 401 | 未ログイン |
| `USER_NOT_FOUND` | 404 | ユーザが存在しない |

---

## `PUT /profile`

ログイン中のユーザ自身のプロフィールを更新する。`id` と `isActive` は変更不可。
`currentPassword` と `newPassword` を両方指定するとパスワード変更も同時に行える。

### 認証

- `X-Session-Id` 必須
- `X-Turnstile-Session` 必須

### リクエスト

```json
{
  "type": "object",
  "properties": {
    "displayName":     { "type": "string", "description": "0〜128文字" },
    "bio":             { "type": ["string", "null"], "description": "0〜500文字。null で削除" },
    "email":           { "type": ["string", "null"], "description": "メールアドレス形式。null で削除" },
    "currentPassword": { "type": "string", "description": "パスワード変更時: 現在のパスワード (newPassword と一緒に指定)" },
    "newPassword":     { "type": "string", "minLength": 8, "maxLength": 128, "description": "パスワード変更時: 新しいパスワード (currentPassword と一緒に指定)" }
  }
}
```

`currentPassword` と `newPassword` は両方指定するか両方省略するかのどちらか。片方だけ指定するとバリデーションエラー。

### レスポンス

- `200 OK` — 更新後の `User` オブジェクト

### エラー

| コード | HTTP | 説明 |
|---|---|---|
| `VALIDATION_ERROR` | 400 | バリデーション失敗 (currentPassword/newPassword は両方必要) |
| `INVALID_PASSWORD` | 400 | currentPassword が正しくない |
| `UNAUTHORIZED` | 401 | 未ログイン / Turnstile セッション無効 |
| `USER_NOT_FOUND` | 404 | ユーザが存在しない |

---

## `DELETE /profile`

ログイン中のユーザ自身のアカウントを削除する。管理者ユーザは削除不可。
削除後も投稿は残る (`userId` が `null` になる)。

### 認証

- `X-Session-Id` 必須
- `X-Turnstile-Session` 必須

### リクエスト

リクエストボディなし。

### レスポンス

- `204 No Content`

### エラー

| コード | HTTP | 説明 |
|---|---|---|
| `UNAUTHORIZED` | 401 | 未ログイン / Turnstile セッション無効 |
| `FORBIDDEN` | 403 | システムユーザは削除不可 |
