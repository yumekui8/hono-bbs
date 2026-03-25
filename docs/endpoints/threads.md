# エンドポイント: `/boards/:boardId` (スレッド)

ベースパス: `{API_BASE_PATH}/boards/:boardId`

## 概要

スレッド (Thread) の一覧取得・作成・更新・削除を行う。
スレッド作成時は本文 (content) から第1レスが同時に作成される。

スレッドは独自の `administrators`、`members`、`permissions` を持ち、
投稿への権限設定とは独立している。

### Thread スキーマ

```jsonc
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "boardId": "general",
  "administrators": "admin,user123",  // カンマ区切りの userId/roleId
  "members": "",
  "permissions": "31,28,24,16",       // admins,members,users,anon (各値 0-31)
  "title": "雑談スレ",
  "maxPosts": 0,              // 0=ボードのデフォルトを継承
  "maxPostLength": 0,         // 0=ボードのデフォルトを継承
  "maxPostLines": 0,          // 0=ボードのデフォルトを継承
  "maxPosterNameLength": 0,   // 0=ボードのデフォルトを継承
  "maxPosterOptionLength": 0, // 0=ボードのデフォルトを継承
  "posterName": "",           // ''=ボードのデフォルトを継承
  "idFormat": "",             // ''=ボードのデフォルトを継承
  "postCount": 10,
  "isEdited": false,
  "editedAt": null,
  "createdAt": "2026-01-01T00:00:00.000Z",
  "updatedAt": "2026-01-02T00:00:00.000Z",
  // adminMeta: admin-role または user-admin-role メンバーのみ返却
  "adminMeta": {
    "creatorUserId": "user123",
    "creatorSessionId": "session-uuid",
    "creatorTurnstileSessionId": "turnstile-uuid"
  }
}
```

---

## `GET /boards/:boardId`

板情報とスレッド一覧を取得する。
板の GET 権限が必要。スレッド個別に GET 権限チェックが行われ、権限のないスレッドは除外される。

### 認証

不要 (ただし認証によって見えるスレッドが変わる)

### クエリパラメータ

| パラメータ | 説明 |
|---|---|
| `posts` | 投稿レンジ指定 (後述) |

#### `?posts=` クエリパラメータ

スレッドに付随する投稿を範囲指定で取得できる (省略時は全件)。

| 形式 | 説明 | 例 |
|---|---|---|
| `N` | N 番の投稿のみ | `?posts=5` |
| `N-` | N 番以降の投稿 | `?posts=10-` |
| `-N` | 1〜N 番の投稿 | `?posts=-20` |
| `N-M` | N〜M 番の投稿 | `?posts=10-20` |
| カンマ区切り | 複数レンジの組み合わせ (最大20レンジ) | `?posts=1-5,10,20-` |

### レスポンス

- `200 OK`

```json
{
  "data": {
    "board": { "...": "Board オブジェクト" },
    "threads": [ "...Thread オブジェクトの配列..." ]
  }
}
```

### エラー

| コード | HTTP | 説明 |
|---|---|---|
| `BOARD_NOT_FOUND` | 404 | 板が存在しない、または GET 権限なし |

---

## `POST /boards/:boardId`

スレッドを作成する。同時に第1レスも作成される。
板の **POST 権限**が必要。

### 認証

- `X-Turnstile-Session` 必須 (ENABLE_TURNSTILE=true 時)

### リクエストボディ

```json
{
  "title": "スレッドタイトル",
  "content": "本文 (第1レスの内容)",
  "posterName": "投稿者名 (省略時はボードのデフォルト)",
  "posterOptionInfo": "メール欄等 (省略可)"
}
```

### レスポンス

- `201 Created`

```json
{
  "data": {
    "thread": { "...": "Thread オブジェクト" },
    "firstPost": { "...": "Post オブジェクト (第1レス)" }
  }
}
```

### エラー

| コード | HTTP | 説明 |
|---|---|---|
| `VALIDATION_ERROR` | 400 | バリデーション失敗 |
| `BOARD_NOT_FOUND` | 404 | 板が存在しない |
| `FORBIDDEN` | 403 | POST 権限なし |
| `THREAD_LIMIT_REACHED` | 422 | スレッド数が上限に達した |
| `TITLE_TOO_LONG` | 422 | タイトルが文字数制限を超過 |
| `CONTENT_TOO_LONG` | 422 | 本文が文字数制限を超過 |
| `CONTENT_TOO_MANY_LINES` | 422 | 本文が行数制限を超過 |

---

## `GET /boards/:boardId/:threadId`

スレッド情報と投稿一覧を取得する。
スレッドの GET 権限が必要。

### 認証

不要 (ただし認証によって見える投稿が変わる)

### クエリパラメータ

`GET /boards/:boardId` と同じ `?posts=` クエリパラメータが使用可能。

### レスポンス

- `200 OK`

```json
{
  "data": {
    "thread": { "...": "Thread オブジェクト" },
    "posts": [ "...Post オブジェクトの配列..." ]
  }
}
```

### エラー

| コード | HTTP | 説明 |
|---|---|---|
| `VALIDATION_ERROR` | 400 | `?posts=` の形式が不正 |
| `THREAD_NOT_FOUND` | 404 | スレッドが存在しない、または GET 権限なし |

---

## `PUT /boards/:boardId/:threadId`

スレッドの **タイトルと投稿者名** を更新し、`isEdited` フラグを立てる。
スレッドの **PUT 権限**が必要。
権限設定 (`administrators`、`members`、`permissions`) を変更したい場合は `PATCH` を使用する。

### 認証

- `X-Session-Id` 必須
- `X-Turnstile-Session` 必須

### リクエストボディ

```jsonc
{
  "title": "新しいタイトル",     // 最大 500 文字
  "posterName": "新しい投稿者名" // 最大 50 文字
}
```

すべてのフィールドは省略可能。指定したフィールドのみ更新される。

### レスポンス

- `200 OK` — 更新後の `Thread` オブジェクト

### エラー

| コード | HTTP | 説明 |
|---|---|---|
| `VALIDATION_ERROR` | 400 | バリデーション失敗 |
| `FORBIDDEN` | 403 | 権限不足 |
| `THREAD_NOT_FOUND` | 404 | スレッドが存在しない |

---

## `PATCH /boards/:boardId/:threadId`

スレッドの設定全般を更新する (upsert)。

- **スレッドが存在する場合**: スレッドの **PATCH 権限**が必要。
- **スレッドが存在しない場合**: **sys admin のみ** 新規作成できる (指定した `:threadId` で作成)。

`isEdited` フラグは変更されない (PATCH はメタデータ変更のため)。

### 認証

- `X-Session-Id` 必須
- `X-Turnstile-Session` 必須

### リクエストボディ

```jsonc
{
  "administrators": "$CREATOR",    // $CREATOR/$PARENTS プレースホルダー使用可
  "members": "moderator-role",
  "permissions": "31,28,24,16",
  "title": "タイトル",
  "posterName": "デフォルト投稿者名",
  "maxPosts": 500,                 // 0=ボードのデフォルト継承
  "maxPostLength": 2000,
  "maxPostLines": 100,
  "maxPosterNameLength": 50,
  "maxPosterOptionLength": 100,
  "idFormat": "daily_hash"         // '' = ボードのデフォルト継承
}
```

すべてのフィールドは省略可能。

### レスポンス

- `200 OK` — 更新後または作成した `Thread` オブジェクト

### エラー

| コード | HTTP | 説明 |
|---|---|---|
| `VALIDATION_ERROR` | 400 | バリデーション失敗 |
| `FORBIDDEN` | 403 | 権限不足 |
| `BOARD_NOT_FOUND` | 404 | 板が存在しない (upsert 時) |

---

## `DELETE /boards/:boardId/:threadId`

スレッドを削除する。CASCADE で投稿も削除される。スレッドの **DELETE 権限**が必要。

### 認証

- `X-Session-Id` 必須
- `X-Turnstile-Session` 必須

### レスポンス

- `204 No Content`

### エラー

| コード | HTTP | 説明 |
|---|---|---|
| `FORBIDDEN` | 403 | 権限不足 |
| `THREAD_NOT_FOUND` | 404 | スレッドが存在しない |
