# エンドポイント: `/boards` および `/boards/:boardId`

ベースパス: `{API_BASE_PATH}/boards`

## 概要

板 (Board) の一覧取得・作成・更新・削除を行う。
板は掲示板の最上位コンテナであり、スレッドと投稿を格納する。

### 役割・実装の説明

`GET /boards` は全板の一覧を返すが、読み取り権限のない板は除外される (権限フィルタリング)。
板作成 (`POST /boards`) は `ENDPOINT_PERMISSIONS` の `/boards` 設定に基づいて権限チェックを行う。
デフォルトでは `bbs-admin-group` メンバーのみ板を作成できる。

### 権限フィルタリング

`GET /boards` では、クライアントが GET 権限を持たない板はレスポンスから除外される。
`bbs-admin-group` メンバーは全板を参照可能 (`isAdmin=true`)。

### Board スキーマ

```json
{
  "type": "object",
  "properties": {
    "id":                             { "type": "string" },
    "ownerUserId":                    { "type": ["string", "null"] },
    "ownerGroupId":                   { "type": ["string", "null"] },
    "permissions":                    { "type": "string", "description": "\"owner,group,auth,anon\" 形式のビットマスク" },
    "name":                           { "type": "string" },
    "description":                    { "type": ["string", "null"] },
    "maxThreads":                     { "type": "integer" },
    "maxThreadTitleLength":           { "type": "integer" },
    "defaultMaxPosts":                { "type": "integer" },
    "defaultMaxPostLength":           { "type": "integer" },
    "defaultMaxPostLines":            { "type": "integer" },
    "defaultMaxPosterNameLength":     { "type": "integer" },
    "defaultMaxPosterSubInfoLength":  { "type": "integer" },
    "defaultMaxPosterMetaInfoLength": { "type": "integer" },
    "defaultPosterName":              { "type": "string" },
    "defaultIdFormat": {
      "type": "string",
      "enum": ["daily_hash", "daily_hash_or_user", "api_key_hash", "api_key_hash_or_user", "none"]
    },
    "defaultThreadOwnerUserId":   { "type": ["string", "null"] },
    "defaultThreadOwnerGroupId":  { "type": ["string", "null"] },
    "defaultThreadPermissions":   { "type": "string" },
    "createdAt":                  { "type": "string", "format": "date-time" },
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

---

## `GET /boards`

板の一覧を取得する。読み取り権限のない板は除外される。
`endpoint` フィールドに `/boards` コレクションの権限情報が含まれる。

### 認証

不要 (ただし認証によって見える板が変わる)

### レスポンス

- `200 OK`

```json
{
  "type": "object",
  "properties": {
    "data": {
      "type": "array",
      "items": { "$ref": "#/Board" }
    },
    "endpoint": {
      "type": "object",
      "description": "/boards コレクションの ownership 情報",
      "properties": {
        "ownerUserId":  { "type": ["string", "null"] },
        "ownerGroupId": { "type": ["string", "null"] },
        "permissions":  { "type": "string" }
      }
    }
  }
}
```

---

## `POST /boards`

板を作成する。`ENDPOINT_PERMISSIONS` の `/boards` 設定に基づく POST 権限チェックを行う。
デフォルト: `bbs-admin-group` メンバーのみ作成可能。

### 認証

- `X-Turnstile-Session` 必須
- `X-Session-Id` 必須 (デフォルト権限では bbs-admin-group へのログインが必要)

### リクエスト

```json
{
  "type": "object",
  "required": ["name"],
  "properties": {
    "id":                          { "type": "string", "description": "省略時は UUID 自動生成。英数字・_・-・. のみ" },
    "name":                        { "type": "string", "maxLength": 100 },
    "description":                 { "type": ["string", "null"], "maxLength": 500 },
    "ownerUserId":                 { "type": "string", "description": "省略時は作成者のユーザID" },
    "ownerGroupId":                { "type": "string", "description": "省略時は作成者のプライマリグループ" },
    "permissions":                 { "type": "string", "default": "15,14,12,12", "description": "\"owner,group,auth,anon\" 形式" },
    "maxThreads":                  { "type": "integer", "default": 1000, "minimum": 1, "maximum": 100000 },
    "maxThreadTitleLength":        { "type": "integer", "default": 200, "minimum": 1, "maximum": 1000 },
    "defaultMaxPosts":             { "type": "integer", "default": 1000, "minimum": 1 },
    "defaultMaxPostLength":        { "type": "integer", "default": 2000, "minimum": 1 },
    "defaultMaxPostLines":         { "type": "integer", "default": 100, "minimum": 1 },
    "defaultMaxPosterNameLength":  { "type": "integer", "default": 50, "minimum": 1 },
    "defaultMaxPosterSubInfoLength":  { "type": "integer", "default": 100, "minimum": 1 },
    "defaultMaxPosterMetaInfoLength": { "type": "integer", "default": 200, "minimum": 1 },
    "defaultPosterName":           { "type": "string", "default": "名無し", "maxLength": 50 },
    "defaultIdFormat":             { "type": "string", "default": "daily_hash" },
    "defaultThreadOwnerUserId":    { "type": ["string", "null"] },
    "defaultThreadOwnerGroupId":   { "type": ["string", "null"] },
    "defaultThreadPermissions":    { "type": "string", "default": "15,14,12,12" }
  }
}
```

### レスポンス

- `201 Created` — `Board` オブジェクト

### エラー

| コード | HTTP | 説明 |
|---|---|---|
| `VALIDATION_ERROR` | 400 | バリデーション失敗 |
| `UNAUTHORIZED` | 401 | Turnstile セッション無効 |
| `FORBIDDEN` | 403 | 権限不足 |

---

## `PUT /boards/:boardId`

板のメタ情報を更新する。板の PUT 権限が必要。

### 認証

- `X-Turnstile-Session` 必須
- `X-Session-Id` — 権限によっては必要

### リクエスト

```json
{
  "type": "object",
  "properties": {
    "name":                 { "type": "string", "maxLength": 100 },
    "description":          { "type": ["string", "null"] },
    "ownerUserId":          { "type": ["string", "null"] },
    "ownerGroupId":         { "type": ["string", "null"] },
    "permissions":          { "type": "string" },
    "maxThreads":           { "type": "integer", "minimum": 1 },
    "defaultMaxPosts":      { "type": "integer", "minimum": 1 },
    "defaultMaxPostLength": { "type": "integer", "minimum": 1 },
    "defaultPosterName":    { "type": "string", "maxLength": 50 },
    "defaultIdFormat":      { "type": "string" }
  }
}
```

### レスポンス

- `200 OK` — 更新後の `Board` オブジェクト

### エラー

| コード | HTTP | 説明 |
|---|---|---|
| `VALIDATION_ERROR` | 400 | バリデーション失敗 |
| `UNAUTHORIZED` | 401 | Turnstile セッション無効 |
| `FORBIDDEN` | 403 | 権限不足 |
| `BOARD_NOT_FOUND` | 404 | 板が存在しない |

---

## `DELETE /boards/:boardId`

板を削除する。CASCADE でスレッド・投稿も削除される。板の DELETE 権限が必要。

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
| `BOARD_NOT_FOUND` | 404 | 板が存在しない |
