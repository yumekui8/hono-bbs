# エンドポイント: `/identity/users`

ベースパス: `{API_BASE_PATH}/identity/users`

## 概要

ユーザの登録・一覧取得・個別取得・更新・削除を行う。

- **登録 (`POST`)**: 誰でも可能 (Turnstile 必須)
- **一覧/個別/更新/削除**: `user-admin-group` メンバーのみ (`USER_ADMIN_GROUP` 環境変数で変更可能)

自分自身のプロフィール取得・更新・削除は `/profile` エンドポイントを使用する。

### 役割・実装の説明

ユーザ登録後、`general-group` をプライマリグループとして自動所属する。
`id` (ログインID) は登録後変更不可。英数字・ハイフン・アンダーバーのみ、7〜128文字。
`isActive: false` のアカウントはログイン不可で、`user-admin-group` メンバーのみ変更できる。
削除時はアカウントが消えるが投稿は残り、`userId` が `null` になる。管理者ユーザは削除不可。

### User スキーマ

```json
{
  "type": "object",
  "properties": {
    "id":             { "type": "string", "description": "ログインID兼表示ID。変更不可。英数字・ハイフン・アンダーバーのみ、7〜128文字" },
    "displayName":    { "type": "string", "description": "表示名。日本語可。0〜128文字" },
    "bio":            { "type": ["string", "null"], "description": "自己紹介。省略可" },
    "email":          { "type": ["string", "null"], "description": "メールアドレス。省略可" },
    "isActive":       { "type": "boolean", "description": "アカウント有効フラグ。user-admin-group のみ変更可" },
    "primaryGroupId": { "type": ["string", "null"] },
    "createdAt":      { "type": "string", "format": "date-time" },
    "updatedAt":      { "type": "string", "format": "date-time" }
  }
}
```

---

## `POST /identity/users`

新規ユーザを登録する。Turnstile セッションがあれば誰でも登録可能。

### 認証

- `X-Turnstile-Session` 必須 (ログイン不要)

### リクエスト

```json
{
  "type": "object",
  "required": ["id", "password"],
  "properties": {
    "id":          { "type": "string", "description": "ログインID兼表示ID。英数字・ハイフン・アンダーバーのみ、7〜128文字、変更不可" },
    "displayName": { "type": "string", "description": "表示名。日本語可。0〜128文字。省略時は id と同値" },
    "password":    { "type": "string", "description": "8〜128文字" }
  }
}
```

### レスポンス

- `201 Created` — `User` オブジェクト

### エラー

| コード | HTTP | 説明 |
|---|---|---|
| `VALIDATION_ERROR` | 400 | バリデーション失敗 |
| `UNAUTHORIZED` | 401 | Turnstile セッション無効 |
| `USER_ID_TAKEN` | 409 | ユーザ ID が既に使用されている |

---

## `GET /identity/users`

ユーザ一覧を取得する。ページネーション対応。`user-admin-group` メンバーのみ。

### 認証

- `X-Session-Id` 必須
- `user-admin-group` メンバーのみ

### クエリパラメータ

| パラメータ | 型 | 説明 |
|---|---|---|
| `page` | integer | ページ番号 (1始まり。デフォルト: 1) |

### レスポンス

- `200 OK`

```json
{
  "type": "object",
  "properties": {
    "data":  { "type": "array", "items": { "$ref": "#/User" } },
    "page":  { "type": "integer" },
    "limit": { "type": "integer", "description": "1ページあたりの件数。0=無制限" }
  }
}
```

### エラー

| コード | HTTP | 説明 |
|---|---|---|
| `UNAUTHORIZED` | 401 | 未ログイン |
| `FORBIDDEN` | 403 | user-admin-group メンバーでない |

---

## `GET /identity/users/:id`

指定ユーザの情報を取得する。`user-admin-group` メンバーのみ。

### 認証

- `X-Session-Id` 必須
- `user-admin-group` メンバーのみ

### レスポンス

- `200 OK` — `User` オブジェクト

### エラー

| コード | HTTP | 説明 |
|---|---|---|
| `UNAUTHORIZED` | 401 | 未ログイン |
| `FORBIDDEN` | 403 | 権限不足 |
| `USER_NOT_FOUND` | 404 | ユーザが存在しない |

---

## `PUT /identity/users/:id`

指定ユーザの情報を更新する。`user-admin-group` メンバーのみ可能。
`id` は変更不可。`isActive` はこのエンドポイントでのみ変更できる。

### 認証

- `X-Session-Id` 必須
- `X-Turnstile-Session` 必須
- `user-admin-group` メンバーのみ

### リクエスト

```json
{
  "type": "object",
  "properties": {
    "displayName": { "type": "string", "description": "0〜128文字" },
    "bio":         { "type": ["string", "null"], "description": "0〜500文字。null で削除" },
    "email":       { "type": ["string", "null"], "description": "メールアドレス形式。null で削除" },
    "isActive":    { "type": "boolean", "description": "アカウント有効フラグ" }
  }
}
```

### レスポンス

- `200 OK` — 更新後の `User` オブジェクト

### エラー

| コード | HTTP | 説明 |
|---|---|---|
| `VALIDATION_ERROR` | 400 | バリデーション失敗 |
| `UNAUTHORIZED` | 401 | 未ログイン |
| `FORBIDDEN` | 403 | 権限不足 |
| `USER_NOT_FOUND` | 404 | ユーザが存在しない |

---

## `DELETE /identity/users/:id`

指定ユーザを削除する。`user-admin-group` メンバーのみ可能。
管理者ユーザは削除不可。削除後も投稿は残る (`userId` が `null` になる)。

### 認証

- `X-Session-Id` 必須
- `X-Turnstile-Session` 必須
- `user-admin-group` メンバーのみ

### レスポンス

- `204 No Content`

### エラー

| コード | HTTP | 説明 |
|---|---|---|
| `UNAUTHORIZED` | 401 | 未ログイン |
| `FORBIDDEN` | 403 | 権限不足 / システムユーザは削除不可 |
| `USER_NOT_FOUND` | 404 | ユーザが存在しない |
