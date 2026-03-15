# エンドポイント: `/identity/groups`

ベースパス: `{API_BASE_PATH}/identity/groups`

## 概要

グループの一覧取得・個別取得・作成・更新・削除、およびメンバー管理を行う。
参照はログイン済みユーザが可能。管理操作は `user-admin-group` メンバーのみ可能 (`USER_ADMIN_GROUP` 環境変数で変更可能)。

### 役割・実装の説明

グループはユーザをまとめる単位で、Board/Thread/Post の `ownerGroupId` に使用される。
システムグループは変更・削除不可。保護対象は `USER_ADMIN_GROUP`・`BBS_ADMIN_GROUP` の値に依存する。

デフォルトのシステムグループ一覧:
- `user-admin-group` — ユーザ・グループ管理権限
- `bbs-admin-group` — 掲示板管理権限・`adminMeta` 参照権限
- `admin-group` — `admin` ユーザのプライマリグループ
- `general-group` — 新規ユーザのデフォルトプライマリグループ

### Group スキーマ

```json
{
  "type": "object",
  "properties": {
    "id":        { "type": "string" },
    "name":      { "type": "string" },
    "createdAt": { "type": "string", "format": "date-time" }
  }
}
```

---

## `GET /identity/groups`

グループ一覧を取得する。ページネーション対応。

### 認証

- `X-Session-Id` 必須

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
    "data": {
      "type": "array",
      "items": { "$ref": "#/Group" }
    },
    "page":  { "type": "integer" },
    "limit": { "type": "integer", "description": "1ページあたりの件数。0=無制限" }
  }
}
```

### エラー

| コード | HTTP | 説明 |
|---|---|---|
| `UNAUTHORIZED` | 401 | 未ログイン |

---

## `GET /identity/groups/:id`

指定グループの情報を取得する。

### 認証

- `X-Session-Id` 必須

### レスポンス

- `200 OK` — `Group` オブジェクト

### エラー

| コード | HTTP | 説明 |
|---|---|---|
| `UNAUTHORIZED` | 401 | 未ログイン |
| `GROUP_NOT_FOUND` | 404 | グループが存在しない |

---

## `POST /identity/groups`

グループを作成する。

### 認証

- `X-Session-Id` 必須
- `X-Turnstile-Session` 必須
- `user-admin-group` メンバーのみ

### リクエスト

```json
{
  "type": "object",
  "required": ["name"],
  "properties": {
    "name": {
      "type": "string",
      "description": "英数字・ハイフン・アンダーバーのみ、1〜100文字"
    }
  }
}
```

### レスポンス

- `201 Created` — `Group` オブジェクト

### エラー

| コード | HTTP | 説明 |
|---|---|---|
| `VALIDATION_ERROR` | 400 | バリデーション失敗 |
| `UNAUTHORIZED` | 401 | 未ログイン |
| `FORBIDDEN` | 403 | 権限不足 |
| `GROUP_NAME_TAKEN` | 409 | グループ名が既に使用されている |

---

## `PUT /identity/groups/:id`

グループ情報を更新する。`sys-*` グループは変更不可。

### 認証

- `X-Session-Id` 必須
- `X-Turnstile-Session` 必須
- `user-admin-group` メンバーのみ

### リクエスト

```json
{
  "type": "object",
  "required": ["name"],
  "properties": {
    "name": {
      "type": "string",
      "description": "英数字・ハイフン・アンダーバーのみ、1〜100文字"
    }
  }
}
```

### レスポンス

- `200 OK` — `Group` オブジェクト

### エラー

| コード | HTTP | 説明 |
|---|---|---|
| `VALIDATION_ERROR` | 400 | バリデーション失敗 |
| `UNAUTHORIZED` | 401 | 未ログイン |
| `FORBIDDEN` | 403 | 権限不足 / システムグループは変更不可 |
| `GROUP_NOT_FOUND` | 404 | グループが存在しない |

---

## `DELETE /identity/groups/:id`

グループを削除する。`sys-*` グループは削除不可。

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
| `FORBIDDEN` | 403 | 権限不足 / システムグループは削除不可 |
| `GROUP_NOT_FOUND` | 404 | グループが存在しない |

---

## `POST /identity/groups/:id/members`

グループにユーザを追加する。

### 認証

- `X-Session-Id` 必須
- `X-Turnstile-Session` 必須
- `user-admin-group` メンバーのみ

### リクエスト

```json
{
  "type": "object",
  "required": ["userId"],
  "properties": {
    "userId": { "type": "string", "description": "追加するユーザの ID" }
  }
}
```

### レスポンス

- `204 No Content`

### エラー

| コード | HTTP | 説明 |
|---|---|---|
| `VALIDATION_ERROR` | 400 | `userId` が未指定 |
| `UNAUTHORIZED` | 401 | 未ログイン |
| `FORBIDDEN` | 403 | 権限不足 |
| `GROUP_NOT_FOUND` | 404 | グループが存在しない |
| `USER_NOT_FOUND` | 404 | ユーザが存在しない |

---

## `DELETE /identity/groups/:id/members/:userId`

グループからユーザを削除する。

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
| `FORBIDDEN` | 403 | 権限不足 |
| `MEMBER_NOT_FOUND` | 404 | メンバーがグループに存在しない |
