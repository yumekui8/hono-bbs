# エンドポイント: `/boards/:boardId/:threadId` (投稿操作) および `/boards/:boardId/:threadId/:responseNumber`

ベースパス: `{API_BASE_PATH}/boards/:boardId/:threadId`

## 概要

投稿 (Post) の作成・取得・更新・ソフトデリートを行う。

### 役割・実装の説明

投稿作成 (`POST /boards/:boardId/:threadId`) はスレッドの POST 権限チェックを行う。
投稿番号 (`postNumber`) はスレッド内で 1 始まりの連番。

投稿には「ハード削除」がなく、「ソフトデリート」のみ存在する。
ソフトデリートは `DELETE` で `isDeleted` フラグを立てる実装。ソフトデリートされた投稿は
`posterName` / `posterSubInfo` / `content` が環境変数 (`DELETED_POSTER_NAME` / `DELETED_CONTENT`) で設定した文字列に置き換えられてレスポンスに含まれる。
`PUT` は content の内容更新に使用する。

`displayUserId` は板の `defaultIdFormat` (スレッドが上書き可能) に従って計算される匿名/表示用ID。

投稿の権限は作成時に `"15,0,14,0"` (GET: 全員, POST: 不可, PUT: owner+group+auth, DELETE: 不可) が設定される。
権限フィルタリング: クライアントが GET 権限を持たない投稿は親スレッドのレスポンスから除外される。

### Post スキーマ

```json
{
  "type": "object",
  "properties": {
    "id":            { "type": "string" },
    "threadId":      { "type": "string" },
    "postNumber":    { "type": "integer", "description": "スレッド内の連番。1始まり" },
    "ownerUserId":   { "type": ["string", "null"], "description": "投稿者ユーザID (匿名の場合 null)" },
    "ownerGroupId":  { "type": ["string", "null"], "description": "スレッドの ownerGroupId を継承" },
    "permissions":   { "type": "string", "description": "\"GET,POST,PUT,DELETE\" 形式のビットマスク" },
    "userId":        { "type": ["string", "null"], "description": "ログイン中ユーザID (adminMeta 用)" },
    "displayUserId": { "type": "string", "description": "板の idFormat に従って計算された表示ID" },
    "posterName":    { "type": "string" },
    "posterSubInfo": { "type": ["string", "null"] },
    "content":       { "type": "string" },
    "isDeleted":     { "type": "boolean", "description": "ソフトデリート済みの場合 true。name/content はマスクされる" },
    "createdAt":     { "type": "string", "format": "date-time" },
    "adminMeta": {
      "type": "object",
      "description": "user-admin-group または bbs-admin-group メンバーのみ付与",
      "properties": {
        "creatorUserId":             { "type": ["string", "null"] },
        "creatorSessionId":          { "type": ["string", "null"] },
        "creatorTurnstileSessionId": { "type": ["string", "null"] }
      }
    }
  }
}
```

### displayUserId の計算方式 (idFormat)

| 値 | 説明 |
|---|---|
| `daily_hash` | 全員: `hash(TurnstileSessionId + ":" + YYYY-MM-DD UTC)` 先頭10文字 |
| `daily_hash_or_user` | 匿名: 日毎ハッシュ / ログイン済み: ユーザID先頭10文字 |
| `api_key_hash` | 全員: `hash(TurnstileSessionId)` 先頭10文字 (日付非依存) |
| `api_key_hash_or_user` | 匿名: TurnstileセッションIDハッシュ / ログイン済み: ユーザID先頭10文字 |
| `none` | 表示なし (空文字列) |

---

## `POST /boards/:boardId/:threadId`

投稿を作成する。スレッドの POST 権限が必要。

### 認証

- `X-Turnstile-Session` 必須
- `X-Session-Id` — 任意 (認証ユーザで投稿する場合)

### リクエスト

```json
{
  "type": "object",
  "required": ["content"],
  "properties": {
    "content": {
      "type": "string",
      "description": "1文字以上、スレッド→板の maxPostLength 以下、maxPostLines 行以下"
    },
    "posterName": {
      "type": "string",
      "description": "省略時はスレッド→板のデフォルト投稿者名",
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
    "data": { "$ref": "#/Post" }
  }
}
```

### エラー

| コード | HTTP | 説明 |
|---|---|---|
| `VALIDATION_ERROR` | 400 | バリデーション失敗 |
| `UNAUTHORIZED` | 401 | Turnstile セッション無効 |
| `FORBIDDEN` | 403 | スレッドの POST 権限がない |
| `THREAD_NOT_FOUND` | 404 | スレッドが存在しない |
| `POST_LIMIT_REACHED` | 422 | 投稿数が上限に達した |
| `CONTENT_TOO_LONG` | 422 | 本文が上限文字数を超えた |
| `CONTENT_TOO_MANY_LINES` | 422 | 本文行数が上限を超えた |

---

## `GET /boards/:boardId/:threadId/:responseNumber`

レス番号で単一の投稿を取得する。
スレッドまたは投稿自体に GET 権限がない場合は 404 を返す。

### 認証

不要 (ただし認証によって権限チェック結果が変わる)

### パスパラメータ

| パラメータ | 説明 |
|---|---|
| `boardId` | 板 ID |
| `threadId` | スレッド ID |
| `responseNumber` | 投稿番号 (1始まりの整数) |

### レスポンス

- `200 OK`

```json
{
  "type": "object",
  "properties": {
    "data": { "$ref": "#/Post" }
  }
}
```

### エラー

| コード | HTTP | 説明 |
|---|---|---|
| `VALIDATION_ERROR` | 400 | responseNumber が不正 |
| `POST_NOT_FOUND` | 404 | 投稿が存在しない、またはスレッド/投稿の読み取り権限がない |

---

## `PUT /boards/:boardId/:threadId/:responseNumber`

投稿の本文 (content) を更新する。投稿の PUT 権限が必要。

### 認証

- `X-Turnstile-Session` 必須
- `X-Session-Id` — 権限によっては必要

### リクエスト

```json
{
  "type": "object",
  "required": ["content"],
  "properties": {
    "content": {
      "type": "string",
      "description": "1文字以上"
    }
  }
}
```

### レスポンス

- `200 OK` — 更新後の `Post` オブジェクト

### エラー

| コード | HTTP | 説明 |
|---|---|---|
| `VALIDATION_ERROR` | 400 | responseNumber が不正またはボディが不正 |
| `UNAUTHORIZED` | 401 | Turnstile セッション無効 |
| `FORBIDDEN` | 403 | 権限不足 |
| `POST_NOT_FOUND` | 404 | 投稿が存在しない |

---

## `DELETE /boards/:boardId/:threadId/:responseNumber`

投稿をソフトデリートする。`isDeleted` フラグが立ち、以後のレスポンスで name/content がマスクされる。
投稿の DELETE 権限が必要。ハード削除は存在しない。

### 認証

- `X-Turnstile-Session` 必須
- `X-Session-Id` — 権限によっては必要

### リクエスト

リクエストボディは不要。

### レスポンス

- `200 OK` — ソフトデリート後の `Post` オブジェクト (posterName/content がマスク済み)

### エラー

| コード | HTTP | 説明 |
|---|---|---|
| `VALIDATION_ERROR` | 400 | responseNumber が不正 |
| `UNAUTHORIZED` | 401 | Turnstile セッション無効 |
| `FORBIDDEN` | 403 | 権限不足 |
| `POST_NOT_FOUND` | 404 | 投稿が存在しない |
