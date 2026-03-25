# エンドポイント: `/boards` および `/boards/:boardId`

ベースパス: `{API_BASE_PATH}/boards`

## 概要

板 (Board) の一覧取得・作成・更新・削除を行う。
板は掲示板の最上位コンテナであり、スレッドと投稿を格納する。

### 板の権限制御

板の `permissions` フィールドで閲覧・書き込みを制御する。
`GET /boards` では、クライアントが GET 権限を持たない板はレスポンスから除外される。
sys admin (`admin-role` メンバー) は権限チェックをバイパスして全板を参照・操作できる。

板の作成 (`POST /boards`) は sys admin のみ実行できる。
板の更新・削除は当該板の PUT/PATCH/DELETE 権限が必要。

### Board スキーマ

```jsonc
{
  "id": "general",
  "administrators": "admin,moderator-role",  // カンマ区切りの userId/roleId
  "members": "",
  "permissions": "31,28,24,16",  // admins,members,users,anon (各値 0-31)
  "name": "雑談板",
  "description": "なんでも話せる板です",
  "maxThreads": 1000,               // 0=無制限
  "maxThreadTitleLength": 200,      // 0=無制限
  "defaultMaxPosts": 1000,          // 0=無制限
  "defaultMaxPostLength": 2000,     // 0=無制限
  "defaultMaxPostLines": 100,       // 0=無制限
  "defaultMaxPosterNameLength": 50, // 0=無制限
  "defaultMaxPosterOptionLength": 100, // 0=無制限 (メール欄等)
  "defaultPosterName": "名無しさん",
  "defaultIdFormat": "daily_hash",  // 匿名IDのフォーマット
  // スレッド作成時の初期値テンプレート ($CREATOR, $PARENTS が使用可)
  "defaultThreadAdministrators": "$CREATOR",
  "defaultThreadMembers": "",
  "defaultThreadPermissions": "31,28,24,16",
  // 投稿作成時の初期値テンプレート ($CREATOR, $PARENTS が使用可)
  "defaultPostAdministrators": "$CREATOR",
  "defaultPostMembers": "",
  "defaultPostPermissions": "31,28,24,16",
  "category": "雑談",
  "createdAt": "2026-01-01T00:00:00.000Z",
  // adminMeta: admin-role または user-admin-role メンバーのみ返却
  "adminMeta": {
    "creatorUserId": "admin",
    "creatorSessionId": null,
    "creatorTurnstileSessionId": null
  }
}
```

#### defaultIdFormat の値

| 値 | 説明 |
|---|---|
| `daily_hash` | 全員: IP+日付のハッシュ (日替わり ID) |
| `daily_hash_or_user` | 匿名: 日替わりハッシュ / ログイン済み: ユーザーID |
| `api_key_hash` | 全員: X-User-Token ヘッダーのハッシュ |
| `api_key_hash_or_user` | 匿名: トークンハッシュ / ログイン済み: ユーザーID |
| `none` | ID を表示しない |

---

## `GET /boards`

板の一覧を取得する。読み取り権限のない板は除外される。

### 認証

不要 (ただし認証によって見える板が変わる)

### レスポンス

- `200 OK`

```json
{
  "data": [ /* Board オブジェクトの配列 */ ]
}
```

---

## `POST /boards`

板を作成する。**sys admin (`admin-role` メンバー) のみ** 作成可能。

### 認証

- `X-Session-Id` 必須 (sys admin でログイン)
- `X-Turnstile-Session` 必須

### リクエストボディ

```jsonc
{
  // 板ID (省略時は UUID 自動生成。英数字・_・-・. のみ、最大 100 文字)
  "id": "general",
  "name": "雑談板",                      // 必須、最大 100 文字
  "description": "なんでも話せる板です", // 最大 1000 文字
  "administrators": "$CREATOR",          // 省略時は作成者 userId が設定される
  "members": "",
  "permissions": "31,28,24,16",
  "maxThreads": 1000,
  "maxThreadTitleLength": 200,
  "defaultMaxPosts": 1000,
  "defaultMaxPostLength": 2000,
  "defaultMaxPostLines": 100,
  "defaultMaxPosterNameLength": 50,
  "defaultMaxPosterOptionLength": 100,
  "defaultPosterName": "名無しさん",
  "defaultIdFormat": "daily_hash",
  "defaultThreadAdministrators": "$CREATOR",
  "defaultThreadMembers": "",
  "defaultThreadPermissions": "31,28,24,16",
  "defaultPostAdministrators": "$CREATOR",
  "defaultPostMembers": "",
  "defaultPostPermissions": "31,28,24,16",
  "category": "雑談"
}
```

`name`、`description`、`permissions`、`maxThreads`、`maxThreadTitleLength`、
`defaultMaxPosts`、`defaultMaxPostLength`、`defaultMaxPostLines`、
`defaultMaxPosterNameLength`、`defaultMaxPosterOptionLength`、`defaultPosterName`、
`defaultIdFormat`、`defaultThreadAdministrators`、`defaultThreadPermissions`、
`defaultPostAdministrators`、`defaultPostPermissions` は必須フィールド。

### レスポンス

- `201 Created` — 作成した `Board` オブジェクト

### エラー

| コード | HTTP | 説明 |
|---|---|---|
| `VALIDATION_ERROR` | 400 | バリデーション失敗 |
| `FORBIDDEN` | 403 | sys admin でない |

---

## `PUT /boards/:boardId`

板の表示情報 (`name`、`description`、`category`) のみを更新する。
板の **PUT 権限**が必要。権限設定や制限値を変更したい場合は `PATCH` を使用する。

### 認証

- `X-Session-Id` 必須
- `X-Turnstile-Session` 必須

### リクエストボディ

```jsonc
{
  "name": "新しい板名",       // 最大 100 文字
  "description": "説明文",    // 最大 1000 文字
  "category": "カテゴリ名"    // 最大 128 文字
}
```

すべてのフィールドは省略可能。指定したフィールドのみ更新される。

### レスポンス

- `200 OK` — 更新後の `Board` オブジェクト

### エラー

| コード | HTTP | 説明 |
|---|---|---|
| `VALIDATION_ERROR` | 400 | バリデーション失敗 |
| `FORBIDDEN` | 403 | 権限不足 |
| `BOARD_NOT_FOUND` | 404 | 板が存在しない |

---

## `PATCH /boards/:boardId`

板の全フィールドを更新する (upsert)。

- **板が存在する場合**: 板の **PATCH 権限**が必要。全フィールドを上書き更新する。
- **板が存在しない場合**: **sys admin のみ** 新規作成できる (指定した `:boardId` で作成)。

### 認証

- `X-Session-Id` 必須
- `X-Turnstile-Session` 必須

### リクエストボディ

`POST /boards` と同じスキーマ。`id` フィールドは無視され、URL の `:boardId` が使われる。

### レスポンス

- `200 OK` — 更新後または作成した `Board` オブジェクト

### エラー

| コード | HTTP | 説明 |
|---|---|---|
| `VALIDATION_ERROR` | 400 | バリデーション失敗 |
| `FORBIDDEN` | 403 | 権限不足 (板が存在しない場合は sys admin でない) |
| `BOARD_NOT_FOUND` | 404 | 板が存在しない (PATCH 時の内部エラー) |

---

## `DELETE /boards/:boardId`

板を削除する。CASCADE でスレッド・投稿も削除される。板の **DELETE 権限**が必要。

### 認証

- `X-Session-Id` 必須
- `X-Turnstile-Session` 必須

### レスポンス

- `204 No Content`

### エラー

| コード | HTTP | 説明 |
|---|---|---|
| `FORBIDDEN` | 403 | 権限不足 |
| `BOARD_NOT_FOUND` | 404 | 板が存在しない |
