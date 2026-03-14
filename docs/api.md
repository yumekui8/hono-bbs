# hono-bbs API 仕様書

ベースパス: `{API_BASE_PATH}` (デフォルト: `/api/v1`)

---

# 共通仕様

## ヘッダー

- `X-Session-Id` — ログイン必須エンドポイントで使用するユーザセッションID
- `X-Turnstile-Session` — 全 `POST` / `PUT` / `DELETE` で必要な Cloudflare Turnstile セッションID

## レスポンス形式

成功時

```json
{ "data": "<payload>" }
```

エラー時

```json
{ "error": "ERROR_CODE", "message": "説明" }
```

## adminMeta フィールド

板・スレッド・投稿のレスポンスに含まれる管理者専用フィールド。
`sys-user-admin-group` または `sys-bbs-admin-group` メンバーのみ参照できる。
それ以外には返されない。

```json
{
  "creatorUserId": "string | null",
  "creatorSessionId": "string | null",
  "creatorTurnstileSessionId": "string | null"
}
```

## 権限ビットマスク

板・スレッド・投稿・bbs_root の `permissions` フィールドは `"<GET>,<POST>,<PUT>,<DELETE>"` 形式の文字列。
各値はユーザ種別ビットの組み合わせ。

- `owner` = `8` — リソースのオーナーユーザ
- `group` = `4` — リソースのオーナーグループメンバー
- `auth` = `2` — ログイン済みユーザ
- `anon` = `1` — 匿名ユーザ (未ログイン)

例: `"15,4,0,0"` → GET: 全ユーザ可 (15=8+4+2+1), POST: グループメンバー以上 (4=4), PUT/DELETE: 不可 (0)

`isAdmin` (sys-user-admin-group または sys-bbs-admin-group) の場合は権限チェックをバイパスする。

## IDフォーマット

投稿の `displayUserId` 計算方式。板単位で設定しスレッド単位で上書き可能。

- `daily_hash` — 全員: `hash(TurnstileSessionId + ":" + YYYY-MM-DD)` の先頭10文字
- `daily_hash_or_user` — 匿名: 日毎ハッシュ / ログイン済み: ユーザID先頭10文字
- `api_key_hash` — 全員: `hash(TurnstileSessionId)` の先頭10文字 (日付非依存)
- `api_key_hash_or_user` — 匿名: TurnstileセッションIDハッシュ / ログイン済み: ユーザID先頭10文字
- `none` — 表示なし

## 共通スキーマ定義

### User

```json
{
  "type": "object",
  "properties": {
    "id":             { "type": "string", "description": "ログインID兼表示ID。変更不可。英数字・ハイフン・アンダーバーのみ、7〜128文字" },
    "displayName":    { "type": "string", "description": "表示名。日本語可。0〜128文字" },
    "bio":            { "type": ["string", "null"], "description": "自己紹介。省略可" },
    "email":          { "type": ["string", "null"], "description": "メールアドレス。省略可" },
    "isActive":       { "type": "boolean", "description": "アカウント有効フラグ。管理者のみ変更可" },
    "primaryGroupId": { "type": ["string", "null"] },
    "createdAt":      { "type": "string", "format": "date-time" },
    "updatedAt":      { "type": "string", "format": "date-time" }
  }
}
```

### Group

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

### IdentityRoot

```json
{
  "type": "object",
  "description": "読み取り専用。権限はシステム固定で API から変更不可。",
  "properties": {
    "usersRoot": {
      "type": "object",
      "properties": {
        "ownerUserId":  { "type": "null" },
        "ownerGroupId": { "type": "string", "description": "sys-user-admin-group 固定" },
        "permissions":  { "type": "string", "description": "\"GET,POST,PUT,DELETE\" 形式のビットマスク" }
      }
    },
    "groupsRoot": {
      "type": "object",
      "properties": {
        "ownerUserId":  { "type": "null" },
        "ownerGroupId": { "type": "string", "description": "sys-user-admin-group 固定" },
        "permissions":  { "type": "string", "description": "\"GET,POST,PUT,DELETE\" 形式のビットマスク" }
      }
    }
  }
}
```

### BbsRoot

```json
{
  "type": "object",
  "properties": {
    "ownerUserId":  { "type": ["string", "null"] },
    "ownerGroupId": { "type": ["string", "null"] },
    "permissions":  { "type": "string", "description": "\"GET,POST,PUT,DELETE\" 形式のビットマスク" }
  }
}
```

### Board

```json
{
  "type": "object",
  "properties": {
    "id":                          { "type": "string" },
    "ownerUserId":                 { "type": ["string", "null"] },
    "ownerGroupId":                { "type": ["string", "null"] },
    "permissions":                 { "type": "string", "description": "\"GET,POST,PUT,DELETE\" 形式のビットマスク" },
    "name":                        { "type": "string" },
    "description":                 { "type": ["string", "null"] },
    "maxThreads":                  { "type": "integer" },
    "maxThreadTitleLength":        { "type": "integer" },
    "defaultMaxPosts":             { "type": "integer" },
    "defaultMaxPostLength":        { "type": "integer" },
    "defaultMaxPostLines":         { "type": "integer" },
    "defaultMaxPosterNameLength":  { "type": "integer" },
    "defaultMaxPosterSubInfoLength":  { "type": "integer" },
    "defaultMaxPosterMetaInfoLength": { "type": "integer" },
    "defaultPosterName":           { "type": "string" },
    "defaultIdFormat":             { "type": "string", "enum": ["daily_hash", "daily_hash_or_user", "api_key_hash", "api_key_hash_or_user", "none"] },
    "defaultThreadOwnerUserId":    { "type": ["string", "null"] },
    "defaultThreadOwnerGroupId":   { "type": ["string", "null"] },
    "defaultThreadPermissions":    { "type": "string" },
    "createdAt":                   { "type": "string", "format": "date-time" },
    "adminMeta":                   { "$ref": "#/adminMeta", "description": "管理者のみ付与" }
  }
}
```

### Thread

```json
{
  "type": "object",
  "properties": {
    "id":                    { "type": "string" },
    "boardId":               { "type": "string" },
    "ownerUserId":           { "type": ["string", "null"] },
    "ownerGroupId":          { "type": ["string", "null"] },
    "permissions":           { "type": "string" },
    "title":                 { "type": "string" },
    "maxPosts":              { "type": ["integer", "null"], "description": "nullは板の設定を継承" },
    "maxPostLength":         { "type": ["integer", "null"] },
    "maxPostLines":          { "type": ["integer", "null"] },
    "maxPosterNameLength":   { "type": ["integer", "null"] },
    "maxPosterSubInfoLength":{ "type": ["integer", "null"] },
    "maxPosterMetaInfoLength":{ "type": ["integer", "null"] },
    "posterName":            { "type": ["string", "null"] },
    "idFormat":              { "type": ["string", "null"], "enum": ["daily_hash", "daily_hash_or_user", "api_key_hash", "api_key_hash_or_user", "none", null] },
    "postCount":             { "type": "integer" },
    "createdAt":             { "type": "string", "format": "date-time" },
    "updatedAt":             { "type": "string", "format": "date-time" },
    "adminMeta":             { "$ref": "#/adminMeta", "description": "管理者のみ付与" }
  }
}
```

### Post

```json
{
  "type": "object",
  "properties": {
    "id":            { "type": "string" },
    "threadId":      { "type": "string" },
    "postNumber":    { "type": "integer" },
    "ownerUserId":   { "type": ["string", "null"] },
    "ownerGroupId":  { "type": ["string", "null"] },
    "permissions":   { "type": "string", "description": "\"GET,POST,PUT,DELETE\" 形式のビットマスク" },
    "userId":        { "type": ["string", "null"] },
    "displayUserId": { "type": "string", "description": "板のidFormatに従って計算された表示ID" },
    "posterName":    { "type": "string" },
    "posterSubInfo": { "type": ["string", "null"] },
    "content":       { "type": "string" },
    "createdAt":     { "type": "string", "format": "date-time" },
    "adminMeta":     { "$ref": "#/adminMeta", "description": "管理者のみ付与" }
  }
}
```

## システムグループ

`init.sql` で事前定義されている固定グループ。

- `sys-user-admin-group` — ユーザ・グループ管理権限 (`userAdminGroup`)
- `sys-bbs-admin-group` — 掲示板管理権限・`adminMeta` 参照権限 (`bbsAdminGroup`)
- `sys-admin-group` — `sys-admin` ユーザのプライマリグループ
- `sys-general-group` — 新規ユーザのデフォルトプライマリグループ

`sys-admin` ユーザはすべてのシステムグループに所属する。

---

# Auth エンドポイント

## `GET /auth/turnstile`

Cloudflare Turnstile チャレンジ用の HTML ページを返す。
ユーザがチャレンジを完了するとページ内 JS が自動的に `POST /auth/turnstile` を呼び出し、
セッションID をページ上に表示する。チャレンジは1ページ表示中に1回だけ実行される。

- メソッド: `GET`
- 認証: 不要

### レスポンス

- `200 text/html`

---

## `POST /auth/turnstile`

Cloudflare が発行した Turnstile トークンを検証し、セッションIDを発行する。
セッションIDは `hash(クライアントIP + UserAgent + YYYY-MM-DD UTC)` から生成されるため、
同一クライアントから同日中に再度リクエストした場合は既存のセッションIDを返す (KV書き込みなし)。

`GET /auth/turnstile` のリクエスト `Referer` ヘッダが `ALLOW_BBS_UI_DOMAINS` に含まれるドメインの場合、
認証成功後に元のページへ `?setTurnstileToken=<sessionId>` クエリパラメータ付きでリダイレクトする。

- メソッド: `POST`
- 認証: 不要
- 備考: `DISABLE_TURNSTILE=true` の場合は検証をスキップし `"dev-turnstile-disabled"` を返す

### リクエスト

```json
{
  "type": "object",
  "required": ["token"],
  "properties": {
    "token": { "type": "string", "description": "Cloudflare Turnstile が発行したトークン" }
  }
}
```

### レスポンス

- `200 OK`

```json
{
  "type": "object",
  "properties": {
    "data": {
      "type": "object",
      "properties": {
        "sessionId":    { "type": "string", "description": "以後の POST/PUT/DELETE で X-Turnstile-Session に使用。24時間有効" },
        "alreadyIssued":{ "type": "boolean", "description": "true の場合、本日同端末からすでに発行済みのセッションを返している" }
      }
    }
  }
}
```

### エラー

- `400 VALIDATION_ERROR` — `token` フィールドがない
- `400 TURNSTILE_FAILED` — Cloudflare 検証失敗。レスポンスに `errorCodes: string[]` が付く
- `500 SESSION_CREATE_FAILED` — KV への書き込み失敗
  - `invalid-input-secret` — サーバのシークレットキーが不正
  - `invalid-input-response` — トークンが期限切れ・不正
  - `timeout-or-duplicate` — トークンが使用済み
  - `hostname-mismatch` — サイトのドメイン設定不一致

---

## `POST /auth/setup`

`sys-admin` ユーザの初期パスワードを設定する。一回限り。
環境変数 `ADMIN_INITIAL_PASSWORD` の値を使用する。

- メソッド: `POST`
- 認証: 不要

### レスポンス

- `200 OK`

```json
{
  "type": "object",
  "properties": {
    "data": {
      "type": "object",
      "properties": {
        "message": { "type": "string" }
      }
    }
  }
}
```

### エラー

- `409 ALREADY_SETUP` — 初期設定済み
- `500 SETUP_NOT_CONFIGURED` — `ADMIN_INITIAL_PASSWORD` が未設定

---

## `POST /auth/login`

ログインしてセッションを発行する。セッションは 24 時間有効。
`isActive: false` のアカウントはログイン不可。

- メソッド: `POST`
- 認証: `X-Turnstile-Session` 必須

### リクエスト

```json
{
  "type": "object",
  "required": ["id", "password"],
  "properties": {
    "id":       { "type": "string", "description": "ログインID" },
    "password": { "type": "string" }
  }
}
```

### レスポンス

- `200 OK`

```json
{
  "type": "object",
  "properties": {
    "data": {
      "type": "object",
      "properties": {
        "sessionId":   { "type": "string", "description": "X-Session-Id に使用。24時間有効" },
        "userId":      { "type": "string" },
        "displayName": { "type": "string" },
        "expiresAt":   { "type": "string", "format": "date-time" }
      }
    }
  }
}
```

### エラー

- `400 VALIDATION_ERROR` — バリデーション失敗
- `401 INVALID_CREDENTIALS` — ID またはパスワードが誤り、またはアカウントが無効
- `401 UNAUTHORIZED` — Turnstile セッション無効

---

## `POST /auth/logout`

ログアウトする。セッションを KV から削除する。

- メソッド: `POST`
- 認証: `X-Session-Id` 必須

### レスポンス

- `204 No Content`

---

# Profile エンドポイント

ログイン中のユーザ自身の情報を操作する。

## `GET /profile`

ログイン中のユーザ自身の情報を取得する。

- メソッド: `GET`
- 認証: `X-Session-Id` 必須

### レスポンス

- `200 OK`

```json
{
  "type": "object",
  "properties": {
    "data": { "$ref": "#/User" }
  }
}
```

### エラー

- `401 UNAUTHORIZED` — 未ログイン
- `404 USER_NOT_FOUND` — ユーザが存在しない

---

## `PUT /profile`

ログイン中のユーザ自身のプロフィールを更新する。`id` と `isActive` は変更不可。

- メソッド: `PUT`
- 認証: `X-Session-Id` 必須 / `X-Turnstile-Session` 必須

### リクエスト

```json
{
  "type": "object",
  "properties": {
    "displayName": { "type": "string", "description": "0〜128文字" },
    "bio":         { "type": ["string", "null"], "description": "0〜500文字。null で削除" },
    "email":       { "type": ["string", "null"], "description": "メールアドレス形式。null で削除" }
  }
}
```

### レスポンス

- `200 OK` — 更新後の `User` オブジェクト

### エラー

- `400 VALIDATION_ERROR` — バリデーション失敗
- `401 UNAUTHORIZED` — 未ログイン
- `404 USER_NOT_FOUND` — ユーザが存在しない

---

## `PUT /profile/password`

ログイン中のユーザ自身のパスワードを変更する。現在のパスワード確認が必須。

- メソッド: `PUT`
- 認証: `X-Session-Id` 必須 / `X-Turnstile-Session` 必須

### リクエスト

```json
{
  "type": "object",
  "required": ["currentPassword", "newPassword"],
  "properties": {
    "currentPassword": { "type": "string", "description": "現在のパスワード" },
    "newPassword":     { "type": "string", "description": "8〜128文字" }
  }
}
```

### レスポンス

- `200 OK` — 更新後の `User` オブジェクト

### エラー

- `400 VALIDATION_ERROR` — バリデーション失敗
- `400 INVALID_PASSWORD` — 現在のパスワードが誤り
- `401 UNAUTHORIZED` — 未ログイン
- `404 USER_NOT_FOUND` — ユーザが存在しない

---

## `DELETE /profile`

ログイン中のユーザ自身のアカウントを削除する。
`sys-admin` は削除不可。削除後も投稿は残る (`userId` が `null` になる)。

- メソッド: `DELETE`
- 認証: `X-Session-Id` 必須 / `X-Turnstile-Session` 必須

### レスポンス

- `204 No Content`

### エラー

- `401 UNAUTHORIZED` — 未ログイン
- `403 FORBIDDEN` — システムユーザは削除不可

---

# Identity エンドポイント

ユーザ・グループの管理を行う。`sys-user-admin-group` メンバーのみ操作可能。

## `GET /identity/root`

identity サブシステムのルートオブジェクトを取得する。
ユーザコレクション・グループコレクションの権限・所有情報を参照できる。
権限はシステム固定で API から変更不可 (読み取り専用)。

- メソッド: `GET`
- 認証: 不要

### レスポンス

- `200 OK`

```json
{
  "type": "object",
  "properties": {
    "data": { "$ref": "#/IdentityRoot" }
  }
}
```

---

## `POST /identity/users`

新規ユーザを登録する。登録後のユーザは `sys-general-group` をプライマリグループとして所属する。
`sys-user-admin-group` メンバー、またはTurnstileセッションがあれば誰でも登録可能。

- メソッド: `POST`
- 認証: `X-Turnstile-Session` 必須

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

```json
{
  "type": "object",
  "properties": {
    "data": { "$ref": "#/User" }
  }
}
```

### エラー

- `400 VALIDATION_ERROR` — バリデーション失敗
- `401 UNAUTHORIZED` — Turnstile セッション無効
- `409 USER_ID_TAKEN` — ユーザID重複

---

## `GET /identity/users`

ユーザ一覧を取得する。ページネーション対応。

- メソッド: `GET`
- 認証: `X-Session-Id` 必須 / `sys-user-admin-group` メンバーのみ

### クエリパラメータ

- `page` — ページ番号 (1始まり。デフォルト: 1)

### レスポンス

- `200 OK`

```json
{
  "type": "object",
  "properties": {
    "data": {
      "type": "array",
      "items": { "$ref": "#/User" }
    }
  }
}
```

### エラー

- `401 UNAUTHORIZED` — 未ログイン
- `403 FORBIDDEN` — 権限不足

---

## `GET /identity/users/:id`

指定ユーザの情報を取得する。自分自身または `sys-user-admin-group` メンバーのみ参照可能。

- メソッド: `GET`
- 認証: `X-Session-Id` 必須

### レスポンス

- `200 OK`

```json
{
  "type": "object",
  "properties": {
    "data": { "$ref": "#/User" }
  }
}
```

### エラー

- `401 UNAUTHORIZED` — 未ログイン
- `403 FORBIDDEN` — 権限不足
- `404 USER_NOT_FOUND` — ユーザが存在しない

---

## `PUT /identity/users/:id`

指定ユーザの情報を更新する。`sys-user-admin-group` メンバーのみ可能。
`id` は変更不可。`isActive` はこのエンドポイントでのみ変更できる。

- メソッド: `PUT`
- 認証: `X-Session-Id` 必須 / `X-Turnstile-Session` 必須 / `sys-user-admin-group` メンバーのみ

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

- `400 VALIDATION_ERROR` — バリデーション失敗
- `401 UNAUTHORIZED` — 未ログイン
- `403 FORBIDDEN` — 権限不足
- `404 USER_NOT_FOUND` — ユーザが存在しない

---

## `PUT /identity/users/:id/password`

指定ユーザのパスワードを変更する。`sys-user-admin-group` メンバーのみ可能。
自分自身のパスワードを変更する場合は現在のパスワード確認が必要。

- メソッド: `PUT`
- 認証: `X-Session-Id` 必須 / `X-Turnstile-Session` 必須 / `sys-user-admin-group` メンバーのみ

### リクエスト

```json
{
  "type": "object",
  "required": ["newPassword"],
  "properties": {
    "currentPassword": { "type": "string", "description": "自分自身のパスワード変更時のみ必須" },
    "newPassword":     { "type": "string", "description": "8〜128文字" }
  }
}
```

### レスポンス

- `200 OK` — 更新後の `User` オブジェクト

### エラー

- `400 VALIDATION_ERROR` — バリデーション失敗 / `currentPassword` が未指定
- `400 INVALID_PASSWORD` — 現在のパスワードが誤り
- `401 UNAUTHORIZED` — 未ログイン
- `403 FORBIDDEN` — 権限不足
- `404 USER_NOT_FOUND` — ユーザが存在しない

---

## `DELETE /identity/users/:id`

指定ユーザを削除する。`sys-user-admin-group` メンバーのみ可能。
`sys-admin` は削除不可。削除後も投稿は残る (`userId` が `null` になる)。

- メソッド: `DELETE`
- 認証: `X-Session-Id` 必須 / `X-Turnstile-Session` 必須 / `sys-user-admin-group` メンバーのみ

### レスポンス

- `204 No Content`

### エラー

- `401 UNAUTHORIZED` — 未ログイン
- `403 FORBIDDEN` — 権限不足 / システムユーザは削除不可
- `404 USER_NOT_FOUND` — ユーザが存在しない

---

## `GET /identity/groups`

グループ一覧を取得する。ページネーション対応。

- メソッド: `GET`
- 認証: `X-Session-Id` 必須

### クエリパラメータ

- `page` — ページ番号 (1始まり。デフォルト: 1)

### レスポンス

- `200 OK`

```json
{
  "type": "object",
  "properties": {
    "data": {
      "type": "array",
      "items": { "$ref": "#/Group" }
    }
  }
}
```

### エラー

- `401 UNAUTHORIZED` — 未ログイン

---

## `GET /identity/groups/:id`

指定グループの情報を取得する。

- メソッド: `GET`
- 認証: `X-Session-Id` 必須

### レスポンス

- `200 OK`

```json
{
  "type": "object",
  "properties": {
    "data": { "$ref": "#/Group" }
  }
}
```

### エラー

- `401 UNAUTHORIZED` — 未ログイン
- `404 GROUP_NOT_FOUND` — グループが存在しない

---

## `POST /identity/groups`

グループを作成する。

- メソッド: `POST`
- 認証: `X-Session-Id` 必須 / `X-Turnstile-Session` 必須 / `sys-user-admin-group` メンバーのみ

### リクエスト

```json
{
  "type": "object",
  "required": ["name"],
  "properties": {
    "name": { "type": "string", "description": "英数字・ハイフン・アンダーバーのみ、1〜100文字" }
  }
}
```

### レスポンス

- `201 Created` — `Group` オブジェクト

### エラー

- `400 VALIDATION_ERROR` — バリデーション失敗
- `401 UNAUTHORIZED` — 未ログイン
- `403 FORBIDDEN` — 権限不足
- `409 GROUP_NAME_TAKEN` — グループ名重複

---

## `PUT /identity/groups/:id`

グループ情報を更新する。`sys-*` グループは変更不可。

- メソッド: `PUT`
- 認証: `X-Session-Id` 必須 / `X-Turnstile-Session` 必須 / `sys-user-admin-group` メンバーのみ

### リクエスト

```json
{
  "type": "object",
  "required": ["name"],
  "properties": {
    "name": { "type": "string", "description": "英数字・ハイフン・アンダーバーのみ、1〜100文字" }
  }
}
```

### レスポンス

- `200 OK` — `Group` オブジェクト

### エラー

- `401 UNAUTHORIZED` — 未ログイン
- `403 FORBIDDEN` — 権限不足 / システムグループは変更不可
- `404 GROUP_NOT_FOUND` — グループが存在しない

---

## `DELETE /identity/groups/:id`

グループを削除する。`sys-*` グループは削除不可。

- メソッド: `DELETE`
- 認証: `X-Session-Id` 必須 / `X-Turnstile-Session` 必須 / `sys-user-admin-group` メンバーのみ

### レスポンス

- `204 No Content`

### エラー

- `401 UNAUTHORIZED` — 未ログイン
- `403 FORBIDDEN` — 権限不足 / システムグループは削除不可
- `404 GROUP_NOT_FOUND` — グループが存在しない

---

## `POST /identity/groups/:id/members`

グループにユーザを追加する。

- メソッド: `POST`
- 認証: `X-Session-Id` 必須 / `X-Turnstile-Session` 必須 / `sys-user-admin-group` メンバーのみ

### リクエスト

```json
{
  "type": "object",
  "required": ["userId"],
  "properties": {
    "userId": { "type": "string" }
  }
}
```

### レスポンス

- `204 No Content`

### エラー

- `401 UNAUTHORIZED` — 未ログイン
- `403 FORBIDDEN` — 権限不足
- `404 GROUP_NOT_FOUND` — グループが存在しない
- `404 USER_NOT_FOUND` — ユーザが存在しない

---

## `DELETE /identity/groups/:id/members/:userId`

グループからユーザを削除する。

- メソッド: `DELETE`
- 認証: `X-Session-Id` 必須 / `X-Turnstile-Session` 必須 / `sys-user-admin-group` メンバーのみ

### レスポンス

- `204 No Content`

### エラー

- `401 UNAUTHORIZED` — 未ログイン
- `403 FORBIDDEN` — 権限不足
- `404 MEMBER_NOT_FOUND` — メンバーが存在しない

---

# 掲示板 (Board) エンドポイント

## `GET /boards/root`

`/boards` ルートオブジェクトの情報を取得する。板作成の権限設定を管理する。

- メソッド: `GET`
- 認証: 不要

### レスポンス

- `200 OK`

```json
{
  "type": "object",
  "properties": {
    "data": { "$ref": "#/BbsRoot" }
  }
}
```

---

## `PUT /boards/root`

`/boards` ルートオブジェクトの権限設定を更新する。`sys-bbs-admin-group` メンバーのみ可能。

- メソッド: `PUT`
- 認証: `X-Session-Id` 必須 / `X-Turnstile-Session` 必須 / `sys-bbs-admin-group` メンバーのみ

### リクエスト

```json
{
  "type": "object",
  "properties": {
    "ownerUserId":  { "type": ["string", "null"] },
    "ownerGroupId": { "type": ["string", "null"] },
    "permissions":  { "type": "string", "description": "\"GET,POST,PUT,DELETE\" 形式のビットマスク" }
  }
}
```

### レスポンス

- `200 OK` — 更新後の `BbsRoot` オブジェクト

### エラー

- `400 VALIDATION_ERROR` — バリデーション失敗
- `401 UNAUTHORIZED` — 未ログイン
- `403 FORBIDDEN` — 権限不足

---

## `GET /boards`

板の一覧を取得する。誰でも参照可能。

- メソッド: `GET`
- 認証: 不要

### レスポンス

- `200 OK`

```json
{
  "type": "object",
  "properties": {
    "data": {
      "type": "array",
      "items": { "$ref": "#/Board" }
    }
  }
}
```

---

## `POST /boards`

板を作成する。`bbs_root` オブジェクトの POST 権限チェックを行う。

- メソッド: `POST`
- 認証: `X-Session-Id` 必須 / `X-Turnstile-Session` 必須

### リクエスト

```json
{
  "type": "object",
  "required": ["name"],
  "properties": {
    "id":                          { "type": "string", "description": "省略時は UUID" },
    "name":                        { "type": "string" },
    "description":                 { "type": ["string", "null"] },
    "ownerUserId":                 { "type": ["string", "null"], "description": "省略時は作成者のID" },
    "ownerGroupId":                { "type": ["string", "null"], "description": "省略時は作成者のプライマリグループ" },
    "permissions":                 { "type": "string", "default": "15,4,2,1", "description": "\"GET,POST,PUT,DELETE\" 形式" },
    "maxThreads":                  { "type": "integer", "default": 1000 },
    "maxThreadTitleLength":        { "type": "integer", "default": 200 },
    "defaultMaxPosts":             { "type": "integer", "default": 1000 },
    "defaultMaxPostLength":        { "type": "integer", "default": 2000 },
    "defaultMaxPostLines":         { "type": "integer", "default": 100 },
    "defaultMaxPosterNameLength":  { "type": "integer", "default": 50 },
    "defaultMaxPosterSubInfoLength":  { "type": "integer", "default": 100 },
    "defaultMaxPosterMetaInfoLength": { "type": "integer", "default": 200 },
    "defaultPosterName":           { "type": "string", "default": "名無し" },
    "defaultIdFormat":             { "type": "string", "default": "daily_hash" },
    "defaultThreadOwnerUserId":    { "type": ["string", "null"] },
    "defaultThreadOwnerGroupId":   { "type": ["string", "null"] },
    "defaultThreadPermissions":    { "type": "string", "default": "15,4,14,2" }
  }
}
```

### レスポンス

- `201 Created` — `Board` オブジェクト

### エラー

- `400 VALIDATION_ERROR` — バリデーション失敗
- `401 UNAUTHORIZED` — 未ログイン
- `403 FORBIDDEN` — 権限不足

---

## `PUT /boards/:boardId`

板のメタ情報を更新する。板の PUT 権限が必要。

- メソッド: `PUT`
- 認証: `X-Session-Id` 必須 / `X-Turnstile-Session` 必須

### リクエスト

```json
{
  "type": "object",
  "properties": {
    "name":                 { "type": "string" },
    "description":          { "type": ["string", "null"] },
    "ownerUserId":          { "type": ["string", "null"] },
    "ownerGroupId":         { "type": ["string", "null"] },
    "permissions":          { "type": "string" },
    "maxThreads":           { "type": "integer" },
    "defaultMaxPosts":      { "type": "integer" },
    "defaultMaxPostLength": { "type": "integer" },
    "defaultMaxPostLines":  { "type": "integer" },
    "defaultPosterName":    { "type": "string" },
    "defaultIdFormat":      { "type": "string" }
  }
}
```

### レスポンス

- `200 OK` — 更新後の `Board` オブジェクト

### エラー

- `401 UNAUTHORIZED` — 未ログイン
- `403 FORBIDDEN` — 権限不足
- `404 BOARD_NOT_FOUND` — 板が存在しない

---

## `DELETE /boards/:boardId`

板を削除する (CASCADE: スレッド・投稿も削除)。板の DELETE 権限が必要。

- メソッド: `DELETE`
- 認証: `X-Session-Id` 必須 / `X-Turnstile-Session` 必須

### レスポンス

- `204 No Content`

### エラー

- `401 UNAUTHORIZED` — 未ログイン
- `403 FORBIDDEN` — 権限不足
- `404 BOARD_NOT_FOUND` — 板が存在しない

---

# スレッド (Thread) エンドポイント

## `GET /boards/:boardId`

スレッド一覧を取得する。板のメタ情報も含む。誰でも参照可能。

- メソッド: `GET`
- 認証: 不要

### レスポンス

- `200 OK`

```json
{
  "type": "object",
  "properties": {
    "data": {
      "type": "object",
      "properties": {
        "board":   { "$ref": "#/Board" },
        "threads": { "type": "array", "items": { "$ref": "#/Thread" } }
      }
    }
  }
}
```

### エラー

- `404 BOARD_NOT_FOUND` — 板が存在しない

---

## `POST /boards/:boardId`

スレッドを作成する。同時に第1レスも作成される。板の POST 権限が必要。

- メソッド: `POST`
- 認証: `X-Turnstile-Session` 必須 (`X-Session-Id` は任意)

### リクエスト

```json
{
  "type": "object",
  "required": ["title", "content"],
  "properties": {
    "title":        { "type": "string", "description": "1文字以上、板の maxThreadTitleLength 以下" },
    "content":      { "type": "string", "description": "1文字以上、板の defaultMaxPostLength 以下" },
    "posterName":   { "type": "string", "description": "省略時は板のデフォルト投稿者名" },
    "posterSubInfo":{ "type": "string", "description": "sage 等。省略可" }
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

- `400 VALIDATION_ERROR` — バリデーション失敗
- `401 UNAUTHORIZED` — Turnstile セッション無効
- `403 FORBIDDEN` — 権限不足
- `404 BOARD_NOT_FOUND` — 板が存在しない
- `422 THREAD_LIMIT_REACHED` — スレッド数上限超過
- `422 TITLE_TOO_LONG` — タイトル文字数超過
- `422 CONTENT_TOO_LONG` — 本文文字数超過
- `422 CONTENT_TOO_MANY_LINES` — 本文行数超過

---

## `GET /boards/:boardId/:threadId`

スレッドの詳細と投稿一覧を取得する。誰でも参照可能。

- メソッド: `GET`
- 認証: 不要

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
        "posts":  { "type": "array", "items": { "$ref": "#/Post" } }
      }
    }
  }
}
```

### エラー

- `404 THREAD_NOT_FOUND` — スレッドが存在しない

---

## `PUT /boards/:boardId/:threadId`

スレッドのメタ情報を更新する。スレッドの PUT 権限が必要。

- メソッド: `PUT`
- 認証: `X-Session-Id` 必須 / `X-Turnstile-Session` 必須

### リクエスト

```json
{
  "type": "object",
  "properties": {
    "title":      { "type": "string" },
    "maxPosts":   { "type": ["integer", "null"] },
    "posterName": { "type": ["string", "null"] },
    "idFormat":   { "type": ["string", "null"] }
  }
}
```

### レスポンス

- `200 OK` — 更新後の `Thread` オブジェクト

### エラー

- `401 UNAUTHORIZED` — 未ログイン
- `403 FORBIDDEN` — 権限不足
- `404 THREAD_NOT_FOUND` — スレッドが存在しない

---

## `DELETE /boards/:boardId/:threadId`

スレッドを削除する (CASCADE: 投稿も削除)。スレッドの DELETE 権限が必要。

- メソッド: `DELETE`
- 認証: `X-Session-Id` 必須 / `X-Turnstile-Session` 必須

### レスポンス

- `204 No Content`

### エラー

- `401 UNAUTHORIZED` — 未ログイン
- `403 FORBIDDEN` — 権限不足
- `404 THREAD_NOT_FOUND` — スレッドが存在しない

---

# 投稿 (Post) エンドポイント

## `POST /boards/:boardId/:threadId`

投稿を作成する。スレッドの POST 権限が必要。

- メソッド: `POST`
- 認証: `X-Turnstile-Session` 必須 (`X-Session-Id` は任意)

### リクエスト

```json
{
  "type": "object",
  "required": ["content"],
  "properties": {
    "content":      { "type": "string", "description": "1文字以上、スレッド→板の maxPostLength 以下" },
    "posterName":   { "type": "string", "description": "省略時はスレッド→板のデフォルト投稿者名" },
    "posterSubInfo":{ "type": "string", "description": "sage 等。省略可" }
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

- `400 VALIDATION_ERROR` — バリデーション失敗
- `401 UNAUTHORIZED` — Turnstile セッション無効
- `403 FORBIDDEN` — 権限不足
- `404 THREAD_NOT_FOUND` — スレッドが存在しない
- `422 POST_LIMIT_REACHED` — 投稿数上限超過
- `422 CONTENT_TOO_LONG` — 本文文字数超過
- `422 CONTENT_TOO_MANY_LINES` — 本文行数超過

---

## `GET /boards/:boardId/:threadId/:responseNumber`

レス番号で単一の投稿を取得する。誰でも参照可能。

- メソッド: `GET`
- 認証: 不要
- パラメータ: `responseNumber` — 投稿番号 (1始まりの整数)

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

- `404 POST_NOT_FOUND` — 投稿が存在しない

---

## `PUT /boards/:boardId/:threadId/:responseNumber`

投稿の内容をソフトデリートする (内容を削除マーカーに置換)。
投稿の PUT 権限が必要。ハード削除はない。

- メソッド: `PUT`
- 認証: `X-Turnstile-Session` 必須 (`X-Session-Id` は任意)

### リクエスト

リクエストボディは不要。

### レスポンス

- `200 OK` — 更新後の `Post` オブジェクト (content が削除マーカーに置換される)

### エラー

- `401 UNAUTHORIZED` — Turnstile セッション無効
- `403 FORBIDDEN` — 権限不足
- `404 POST_NOT_FOUND` — 投稿が存在しない

---

# 環境変数

| 変数名 | 説明 | デフォルト |
|---|---|---|
| `TURNSTILE_SITE_KEY` | Cloudflare Turnstile サイトキー | — |
| `TURNSTILE_SECRET_KEY` | Cloudflare Turnstile シークレットキー | — |
| `DISABLE_TURNSTILE` | `true` で Turnstile 検証をスキップ (開発用) | `false` |
| `ADMIN_INITIAL_PASSWORD` | `POST /auth/setup` で使用する初期パスワード | — |
| `API_BASE_PATH` | API ベースパス | `/api/v1` |
| `CORS_ORIGIN` | 許可する CORS オリジン (カンマ区切り) | `*` |
| `BBS_ALLOW_DOMAIN` | 許可するドメイン (カンマ区切り、未設定で制限なし) | — |
| `ALLOW_BBS_UI_DOMAINS` | Turnstile認証後にリダイレクトを許可するUIドメイン (カンマ区切り、未設定でリダイレクトなし) | — |
| `USER_DISPLAY_LIMIT` | ユーザ一覧の1ページあたり件数 (0=無制限) | `0` |
| `GROUP_DISPLAY_LIMIT` | グループ一覧の1ページあたり件数 (0=無制限) | `0` |

---

# エラーコード一覧

| コード | HTTP | 説明 |
|---|---|---|
| `VALIDATION_ERROR` | 400 | リクエストバリデーション失敗 |
| `INVALID_PASSWORD` | 400 | 現在のパスワードが誤り |
| `TURNSTILE_FAILED` | 400 | Turnstile 検証失敗 |
| `UNAUTHORIZED` | 401 | 未認証 (セッションなし・無効・期限切れ) |
| `INVALID_CREDENTIALS` | 401 | ログイン失敗 |
| `FORBIDDEN` | 403 | 権限不足 |
| `NOT_FOUND` | 404 | リソースが存在しない |
| `USER_NOT_FOUND` | 404 | ユーザが存在しない |
| `GROUP_NOT_FOUND` | 404 | グループが存在しない |
| `BOARD_NOT_FOUND` | 404 | 板が存在しない |
| `THREAD_NOT_FOUND` | 404 | スレッドが存在しない |
| `POST_NOT_FOUND` | 404 | 投稿が存在しない |
| `MEMBER_NOT_FOUND` | 404 | グループメンバーが存在しない |
| `USER_ID_TAKEN` | 409 | ユーザID重複 |
| `GROUP_NAME_TAKEN` | 409 | グループ名重複 |
| `ALREADY_SETUP` | 409 | 初期設定済み |
| `THREAD_LIMIT_REACHED` | 422 | スレッド数上限超過 |
| `POST_LIMIT_REACHED` | 422 | 投稿数上限超過 |
| `TITLE_TOO_LONG` | 422 | タイトル文字数超過 |
| `CONTENT_TOO_LONG` | 422 | 本文文字数超過 |
| `CONTENT_TOO_MANY_LINES` | 422 | 本文行数超過 |
| `SETUP_NOT_CONFIGURED` | 500 | `ADMIN_INITIAL_PASSWORD` 未設定 |
| `INTERNAL_SERVER_ERROR` | 500 | サーバ内部エラー |

---

# ローカル開発手順

```bash
# 1. 環境変数設定
cp .dev.vars.example .dev.vars
# .dev.vars を編集して各値を設定

# 2. DB 初期化
npx wrangler d1 execute hono-bbs-db --local --file=schema/init.sql

# 3. サーバ起動
npm run dev

# 4. admin 初期設定
curl -X POST http://localhost:8787/api/v1/auth/setup

# 5. テスト実行
ADMIN_INITIAL_PASSWORD=<password> bash test/bbs.sh
```
