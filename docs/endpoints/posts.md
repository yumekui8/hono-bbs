# エンドポイント: 投稿 (Posts)

ベースパス: `{API_BASE_PATH}/boards/:boardId/:threadId`

## 概要

投稿 (Post) の作成・取得・更新・削除を行う。

- **PUT**: 投稿内容 (本文・名前等) の更新。`isEdited` フラグが立つ。
- **PATCH**: 投稿の権限設定 (`administrators`、`members`、`permissions`) の変更。
- **DELETE**: ソフトデリート。物理削除はなし。削除後も投稿番号は保持され、本文・名前は `DELETED_CONTENT`・`DELETED_POSTER_NAME` 環境変数の値に置き換えられる。

### Post スキーマ

```jsonc
{
  "id": "550e8400-e29b-41d4-a716-446655440001",
  "threadId": "550e8400-e29b-41d4-a716-446655440000",
  "postNumber": 1,                    // スレッド内の投稿番号 (1始まり)
  "administrators": "user123",        // カンマ区切りの userId/roleId
  "members": "",
  "permissions": "31,28,24,16",       // admins,members,users,anon (各値 0-31)
  "authorId": "Ab3xY7q9",             // idFormat に従って計算された表示ID
  "posterName": "名無しさん",
  "posterOptionInfo": "",             // メール欄等の補助情報
  "content": "投稿本文",
  "isDeleted": false,
  "isEdited": false,
  "editedAt": null,
  "createdAt": "2026-01-01T00:00:00.000Z",
  // adminMeta: admin-role または user-admin-role メンバーのみ返却
  "adminMeta": {
    "creatorUserId": "user123",
    "creatorSessionId": "session-uuid",
    "creatorTurnstileSessionId": "turnstile-uuid"
  }
}
```

#### ソフトデリート後のレスポンス例

`isDeleted: true` の投稿は本文・名前が環境変数の値に置き換えられる。

```json
{
  "postNumber": 3,
  "posterName": "あぼーん",
  "posterOptionInfo": "",
  "content": "このレスは削除されました",
  "isDeleted": true
}
```

---

## `POST /boards/:boardId/:threadId`

投稿を作成する。スレッドの **POST 権限**が必要。

### 認証

- `X-Turnstile-Session` 必須 (ENABLE_TURNSTILE=true 時)

### リクエストボディ

```json
{
  "content": "投稿本文",
  "posterName": "投稿者名 (省略時はスレッド→ボードのデフォルト)",
  "posterOptionInfo": "メール欄等 (省略可)"
}
```

### レスポンス

- `201 Created` — 作成した `Post` オブジェクト

### エラー

| コード | HTTP | 説明 |
|---|---|---|
| `VALIDATION_ERROR` | 400 | バリデーション失敗 |
| `FORBIDDEN` | 403 | POST 権限なし |
| `THREAD_NOT_FOUND` | 404 | スレッドが存在しない |
| `POST_LIMIT_REACHED` | 422 | 投稿数が上限に達した |
| `CONTENT_TOO_LONG` | 422 | 本文が文字数制限を超過 |
| `CONTENT_TOO_MANY_LINES` | 422 | 本文が行数制限を超過 |

---

## `GET /boards/:boardId/:threadId/:responseNumber`

指定した投稿番号の投稿を取得する。スレッドの GET 権限が必要。

`:responseNumber` はスレッド内の投稿番号 (1始まりの整数)。

### 認証

不要

### レスポンス

- `200 OK` — `Post` オブジェクト

### エラー

| コード | HTTP | 説明 |
|---|---|---|
| `VALIDATION_ERROR` | 400 | responseNumber が正の整数でない |
| `POST_NOT_FOUND` | 404 | 投稿が存在しない、または GET 権限なし |

---

## `PUT /boards/:boardId/:threadId/:responseNumber`

投稿の **内容** (本文・投稿者名・posterOptionInfo) を更新し、`isEdited` フラグを立てる。
投稿の **PUT 権限**が必要。
権限設定を変更したい場合は `PATCH` を使用する。

### 認証

- `X-Turnstile-Session` 必須

### リクエストボディ

```jsonc
{
  "content": "新しい本文",         // 最大 10000 文字
  "posterName": "新しい投稿者名",  // 最大 50 文字
  "posterOptionInfo": "新しいオプション" // 最大 100 文字
}
```

### レスポンス

- `200 OK` — 更新後の `Post` オブジェクト

### エラー

| コード | HTTP | 説明 |
|---|---|---|
| `VALIDATION_ERROR` | 400 | バリデーション失敗 |
| `FORBIDDEN` | 403 | 権限不足 |
| `POST_NOT_FOUND` | 404 | 投稿が存在しない |

---

## `PATCH /boards/:boardId/:threadId/:responseNumber`

投稿の **権限設定** (`administrators`、`members`、`permissions`) を更新する。
投稿の **PATCH 権限**が必要。ログインが必要。

`isEdited` フラグは変更されない (PATCH は権限設定変更のため)。

### 認証

- `X-Session-Id` 必須
- `X-Turnstile-Session` 必須

### リクエストボディ

```jsonc
{
  "administrators": "$CREATOR,moderator-role",  // $CREATOR/$PARENTS 使用可
  "members": "",
  "permissions": "31,28,24,16"
}
```

すべてのフィールドは省略可能。

### レスポンス

- `200 OK` — 更新後の `Post` オブジェクト

### エラー

| コード | HTTP | 説明 |
|---|---|---|
| `VALIDATION_ERROR` | 400 | バリデーション失敗 |
| `FORBIDDEN` | 403 | 権限不足 |
| `POST_NOT_FOUND` | 404 | 投稿が存在しない |

---

## `DELETE /boards/:boardId/:threadId/:responseNumber`

投稿をソフトデリートする。投稿の **DELETE 権限**が必要。
物理削除はなく、`isDeleted` フラグが立てられる。

### 認証

- `X-Turnstile-Session` 必須

### レスポンス

- `200 OK` — ソフトデリート後の `Post` オブジェクト (本文・名前はマスクされた状態)

### エラー

| コード | HTTP | 説明 |
|---|---|---|
| `FORBIDDEN` | 403 | 権限不足 |
| `POST_NOT_FOUND` | 404 | 投稿が存在しない |
