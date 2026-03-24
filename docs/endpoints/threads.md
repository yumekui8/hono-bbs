# エンドポイント: `/boards/:boardId` (スレッド操作) および `/boards/:boardId/:threadId`

ベースパス: `{API_BASE_PATH}/boards/:boardId`

## 概要

スレッド (Thread) の一覧取得・作成・更新・削除を行う。
スレッドは板の下に属し、投稿 (Post) のコンテナとなる。

### 役割・実装の説明

スレッド一覧は `GET /boards/:boardId` で取得する。板のメタ情報も同時に返される。
スレッド作成 (`POST /boards/:boardId`) は板の POST 権限チェックを行い、
タイトルと本文 (第1レス) を同時に作成する。

スレッド一覧では、クライアントが GET 権限を持たないスレッドは除外される (権限フィルタリング)。
また、板自体に GET 権限がない場合は `404` を返す。

スレッドは板の `defaultThreadPermissions` および `defaultThreadOwnerGroupId` を引き継ぐ。
第1レスの権限は `"10,10,10,8"` (owner/group/auth: GET+PUT, anon: GET のみ) が設定される。

### Thread スキーマ

```json
{
  "type": "object",
  "properties": {
    "id":                     { "type": "string" },
    "boardId":                { "type": "string" },
    "ownerUserId":            { "type": ["string", "null"] },
    "ownerGroupId":           { "type": ["string", "null"] },
    "permissions":            { "type": "string", "description": "\"GET,POST,PUT,DELETE\" 形式のビットマスク" },
    "title":                  { "type": "string" },
    "maxPosts":               { "type": ["integer", "null"], "description": "null は板の設定を継承" },
    "maxPostLength":          { "type": ["integer", "null"] },
    "maxPostLines":           { "type": ["integer", "null"] },
    "maxPosterNameLength":    { "type": ["integer", "null"] },
    "maxPosterSubInfoLength": { "type": ["integer", "null"] },
    "maxPosterMetaInfoLength":{ "type": ["integer", "null"] },
    "posterName":             { "type": ["string", "null"] },
    "idFormat": {
      "type": ["string", "null"],
      "enum": ["daily_hash", "daily_hash_or_user", "api_key_hash", "api_key_hash_or_user", "none", null]
    },
    "postCount":  { "type": "integer" },
    "createdAt":  { "type": "string", "format": "date-time" },
    "updatedAt":  { "type": "string", "format": "date-time" },
    "adminMeta": {
      "type": "object",
      "description": "user-admin-group または bbs-admin-group メンバーのみ付与",
      "properties": {
        "creatorUserId":             { "type": ["string", "null"] },
        "creatorSessionId":          { "type": ["string", "null"] },
        "creatorTurnstileSessionId": { "type": ["string", "null"] }
      }
    },
    "firstPost": {
      "description": "スレッド一覧取得時のみ含まれる。第1レス (postNumber=1) のデータ。存在しない場合は null",
      "oneOf": [
        { "$ref": "#/Post" },
        { "type": "null" }
      ]
    }
  }
}
```

---

## `GET /boards/:boardId`

板のメタ情報とスレッド一覧を取得する。
読み取り権限のないスレッドは除外される。板自体に GET 権限がない場合は 404。

各スレッドには第1レス (`firstPost`) が含まれる。

### 認証

不要 (ただし認証によって見えるスレッドが変わる)

### レスポンス

- `200 OK`

```json
{
  "type": "object",
  "properties": {
    "data": {
      "type": "object",
      "properties": {
        "board": { "$ref": "#/Board" },
        "threads": {
          "type": "array",
          "description": "各スレッドには firstPost フィールドに第1レスのデータが含まれる",
          "items": { "$ref": "#/Thread" }
        }
      }
    }
  }
}
```

### エラー

| コード | HTTP | 説明 |
|---|---|---|
| `BOARD_NOT_FOUND` | 404 | 板が存在しない、または読み取り権限がない |

---

## `POST /boards/:boardId`

スレッドを作成する。同時に第1レスも作成される。板の POST 権限が必要。

### 認証

- `X-Turnstile-Session` 必須
- `X-Session-Id` — 任意 (認証ユーザで投稿する場合)

### リクエスト

```json
{
  "type": "object",
  "required": ["title", "content"],
  "properties": {
    "title": {
      "type": "string",
      "description": "1文字以上、板の maxThreadTitleLength 以下"
    },
    "content": {
      "type": "string",
      "description": "1文字以上、板の defaultMaxPostLength 以下、defaultMaxPostLines 行以下"
    },
    "posterName": {
      "type": "string",
      "description": "省略時は板のデフォルト投稿者名 (defaultPosterName)",
      "maxLength": 50
    },
    "posterSubInfo": {
      "type": "string",
      "description": "sage 等。省略可",
      "maxLength": 100
    }
  }
}
```

### レスポンス

- `201 Created`

```json
{
  "type": "object",
  "properties": {
    "data": {
      "type": "object",
      "properties": {
        "thread":    { "$ref": "#/Thread" },
        "firstPost": { "$ref": "#/Post" }
      }
    }
  }
}
```

### エラー

| コード | HTTP | 説明 |
|---|---|---|
| `VALIDATION_ERROR` | 400 | バリデーション失敗 |
| `UNAUTHORIZED` | 401 | Turnstile セッション無効 |
| `FORBIDDEN` | 403 | 板の POST 権限がない |
| `BOARD_NOT_FOUND` | 404 | 板が存在しない |
| `THREAD_LIMIT_REACHED` | 422 | スレッド数が maxThreads に達した |
| `TITLE_TOO_LONG` | 422 | タイトルが maxThreadTitleLength を超えた |
| `CONTENT_TOO_LONG` | 422 | 本文が defaultMaxPostLength を超えた |
| `CONTENT_TOO_MANY_LINES` | 422 | 本文行数が defaultMaxPostLines を超えた |

---

## `GET /boards/:boardId/:threadId`

スレッドの詳細と投稿一覧を取得する。
読み取り権限のない投稿は除外される。スレッド自体に GET 権限がない場合は 404。

### 認証

不要 (ただし認証によって見える投稿が変わる)

### クエリパラメータ

| パラメータ | 説明 |
|---|---|
| `posts` | 取得する投稿のレス番号範囲を指定する (省略時は全件)。最大20レンジまで指定可能。 |

`posts` パラメータの指定形式:

| 形式 | 説明 | 例 |
|---|---|---|
| `N` | レス番号 N のみ | `?posts=5` |
| `N-M` | N から M (両端含む) | `?posts=1-10` |
| `N-` | N 以降すべて | `?posts=50-` |
| `-N` | 最新 N 件 | `?posts=-20` |
| カンマ区切り | 複数レンジ | `?posts=1,5-10,20-` |

### レスポンス

- `200 OK`

```json
{
  "type": "object",
  "properties": {
    "data": {
      "type": "object",
      "properties": {
        "thread": { "$ref": "#/Thread" },
        "posts": {
          "type": "array",
          "items": { "$ref": "#/Post" }
        }
      }
    }
  }
}
```

### エラー

| コード | HTTP | 説明 |
|---|---|---|
| `THREAD_NOT_FOUND` | 404 | スレッドが存在しない、または読み取り権限がない |

---

## `PUT /boards/:boardId/:threadId`

スレッドのメタ情報を更新する。スレッドの PUT 権限が必要。

### 認証

- `X-Turnstile-Session` 必須
- `X-Session-Id` — 権限によっては必要

### リクエスト

```json
{
  "type": "object",
  "properties": {
    "title":      { "type": "string", "minLength": 1, "maxLength": 200 },
    "maxPosts":   { "type": ["integer", "null"], "minimum": 1 },
    "posterName": { "type": ["string", "null"], "maxLength": 50 },
    "idFormat": {
      "type": ["string", "null"],
      "enum": ["daily_hash", "daily_hash_or_user", "api_key_hash", "api_key_hash_or_user", "none", null]
    }
  }
}
```

### レスポンス

- `200 OK` — 更新後の `Thread` オブジェクト

### エラー

| コード | HTTP | 説明 |
|---|---|---|
| `VALIDATION_ERROR` | 400 | バリデーション失敗 |
| `UNAUTHORIZED` | 401 | Turnstile セッション無効 |
| `FORBIDDEN` | 403 | 権限不足 |
| `THREAD_NOT_FOUND` | 404 | スレッドが存在しない |

---

## `DELETE /boards/:boardId/:threadId`

スレッドを削除する。CASCADE で投稿も削除される。スレッドの DELETE 権限が必要。

### 認証

- `X-Turnstile-Session` 必須
- `X-Session-Id` — 権限によっては必要

### レスポンス

- `204 No Content`

### エラー

| コード | HTTP | 説明 |
|---|---|---|
| `UNAUTHORIZED` | 401 | Turnstile セッション無効 |
| `FORBIDDEN` | 403 | 権限不足 |
| `THREAD_NOT_FOUND` | 404 | スレッドが存在しない |
