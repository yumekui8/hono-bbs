# エンドポイント: `/identity/roles`

ベースパス: `{API_BASE_PATH}/identity/roles`

## 概要

ロール (Role) の管理を行う。**`user-admin-role` メンバーのみ** 操作可能。

ロールはユーザーをグループ化する仕組みで、板・スレッド・投稿の `administrators` や `members` フィールドに
ロールIDを指定することで、そのロールのメンバー全員に権限を付与できる。

### システムロール

以下のロールは変更・削除できない。

| ロールID | 説明 |
|---|---|
| `admin-role` | sys admin ロール。全権限チェックをバイパス。`ADMIN_USERNAME` に応じて変動 |
| `user-admin-role` | ユーザー・ロール管理権限、adminMeta 参照権限 |
| `general-role` | 新規ユーザー登録時に自動付与されるデフォルトロール |

### Role スキーマ

```json
{
  "id": "moderators",
  "name": "moderators",
  "createdAt": "2026-01-01T00:00:00.000Z"
}
```

---

## `GET /identity/roles`

ロール一覧を取得する。

### 認証

- `X-Session-Id` 必須 (`user-admin-role` メンバー)

### クエリパラメータ

| パラメータ | 説明 |
|---|---|
| `page` | ページ番号 (デフォルト: 1) |

### レスポンス

- `200 OK`

```json
{
  "data": [ /* Role オブジェクトの配列 */ ],
  "page": 1,
  "limit": 0
}
```

`limit` は `ROLE_DISPLAY_LIMIT` 環境変数の値。`0` は無制限。

---

## `GET /identity/roles/:id`

ロールを取得する。

### 認証

- `X-Session-Id` 必須 (`user-admin-role` メンバー)

### レスポンス

- `200 OK` — `Role` オブジェクト

### エラー

| コード | HTTP | 説明 |
|---|---|---|
| `ROLE_NOT_FOUND` | 404 | ロールが存在しない |

---

## `POST /identity/roles`

ロールを作成する。

### 認証

- `X-Session-Id` 必須 (`user-admin-role` メンバー)
- `X-Turnstile-Session` 必須

### リクエストボディ

```json
{
  "name": "moderators"
}
```

`name` は英数字・`_`・`-` のみ使用可 (最大 100 文字)。

### レスポンス

- `201 Created` — 作成した `Role` オブジェクト

### エラー

| コード | HTTP | 説明 |
|---|---|---|
| `VALIDATION_ERROR` | 400 | バリデーション失敗 |
| `ROLE_NAME_TAKEN` | 409 | ロール名が重複 |

---

## `PUT /identity/roles/:id`

ロール名を更新する。システムロールは変更不可。

### 認証

- `X-Session-Id` 必須 (`user-admin-role` メンバー)
- `X-Turnstile-Session` 必須

### リクエストボディ

```json
{
  "name": "new-name"
}
```

### レスポンス

- `200 OK` — 更新後の `Role` オブジェクト

### エラー

| コード | HTTP | 説明 |
|---|---|---|
| `VALIDATION_ERROR` | 400 | バリデーション失敗 |
| `FORBIDDEN` | 403 | システムロールは変更不可 |
| `ROLE_NOT_FOUND` | 404 | ロールが存在しない |

---

## `DELETE /identity/roles/:id`

ロールを削除する。システムロールは削除不可。

### 認証

- `X-Session-Id` 必須 (`user-admin-role` メンバー)
- `X-Turnstile-Session` 必須

### レスポンス

- `204 No Content`

### エラー

| コード | HTTP | 説明 |
|---|---|---|
| `FORBIDDEN` | 403 | システムロールは削除不可 |
| `ROLE_NOT_FOUND` | 404 | ロールが存在しない |

---

## `POST /identity/roles/:id/members`

ロールにメンバーを追加する。

### 認証

- `X-Session-Id` 必須 (`user-admin-role` メンバー)
- `X-Turnstile-Session` 必須

### リクエストボディ

```json
{
  "userId": "user123"
}
```

### レスポンス

- `204 No Content`

### エラー

| コード | HTTP | 説明 |
|---|---|---|
| `VALIDATION_ERROR` | 400 | `userId` が未指定 |
| `ROLE_NOT_FOUND` | 404 | ロールが存在しない |
| `USER_NOT_FOUND` | 404 | ユーザーが存在しない |

---

## `DELETE /identity/roles/:id/members/:userId`

ロールからメンバーを削除する。

### 認証

- `X-Session-Id` 必須 (`user-admin-role` メンバー)
- `X-Turnstile-Session` 必須

### レスポンス

- `204 No Content`

### エラー

| コード | HTTP | 説明 |
|---|---|---|
| `MEMBER_NOT_FOUND` | 404 | メンバーが存在しない |
