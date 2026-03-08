# hono-bbs API 仕様書

ベースパス: `{API_BASE_PATH}` (デフォルト: `/api/v1`)

---

## 共通仕様

### リクエストヘッダー

| ヘッダー | 用途 |
|---|---|
| `X-Session-Id` | ユーザログインセッションID |
| `X-Turnstile-Session` | Cloudflare Turnstile セッションID (全 POST/PUT/DELETE で必要) |
| `X-User-Token` | 匿名ユーザのID計算用トークン |

### レスポンス形式

**成功**
```json
{ "data": <payload> }
```

**エラー**
```json
{ "error": "ERROR_CODE", "message": "説明" }
```

### adminMeta フィールド

板・スレッド・投稿のレスポンスには `adminMeta` フィールドが含まれます。
このフィールドは `userAdminGroup` または `bbsAdminGroup` のメンバーのみ参照できます。
それ以外のユーザ（一般ユーザ・匿名ユーザ）には返されません。

```json
"adminMeta": {
  "creatorUserId": "作成者のユーザID (nullは匿名)",
  "creatorSessionId": "作成時のログインセッションID (nullは未ログイン)",
  "creatorTurnstileSessionId": "作成時のTurnstileセッションID"
}
```

### 権限ビットマスク

板・スレッドの `permissions` は `"owner,group,other"` の3つのビットマスクからなる文字列です。

| ビット | 値 | 意味 |
|---|---|---|
| READ | 8 | 読み取り |
| WRITE | 4 | 書き込み |
| DELETE | 2 | 削除 |
| ADMIN | 1 | 管理 (メタ情報変更等) |

例: `"15,12,8"` → owner: すべて許可, group: 読み取り+書き込み+管理, other: 読み取りのみ

---

## Auth エンドポイント

### GET /auth/turnstile
Cloudflare Turnstile ウィジェット HTML ページを返します。

**レスポンス**: `200 text/html`

---

### POST /auth/turnstile
Turnstile トークンを検証し、セッションIDを発行します (有効期間 24 時間)。

**リクエスト**
```json
{ "token": "Turnstileトークン" }
```

**レスポンス** `200`
```json
{ "data": { "sessionId": "turnstile-session-id" } }
```

開発環境で `DISABLE_TURNSTILE=true` の場合は検証をスキップし、固定値 `"dev-turnstile-disabled"` を返します。

**エラー**
| コード | HTTP | 説明 |
|---|---|---|
| `TURNSTILE_FAILED` | 400 | トークン検証失敗 |

---

### POST /auth/setup
admin ユーザの初期パスワードを設定します (一回限り)。
環境変数 `ADMIN_INITIAL_PASSWORD` の値が使用されます。

**レスポンス** `200`
```json
{ "data": { "message": "Admin password has been set" } }
```

**エラー**
| コード | HTTP | 説明 |
|---|---|---|
| `SETUP_NOT_CONFIGURED` | 500 | `ADMIN_INITIAL_PASSWORD` 未設定 |
| `ALREADY_SETUP` | 409 | 初期設定済み |

---

### POST /auth/signup
新規ユーザを登録します。
新規ユーザは `sys-general-group` にプライマリグループとして所属します。

**必須ヘッダー**: `X-Turnstile-Session`

**リクエスト**
```json
{
  "username": "英数字・_・- のみ、1〜50文字",
  "password": "8〜100文字"
}
```

**レスポンス** `201`
```json
{
  "data": {
    "id": "user-id",
    "username": "testuser",
    "primaryGroupId": "sys-general-group",
    "createdAt": "2024-01-01T00:00:00.000Z"
  }
}
```

**エラー**
| コード | HTTP | 説明 |
|---|---|---|
| `VALIDATION_ERROR` | 400 | バリデーション失敗 |
| `USERNAME_TAKEN` | 409 | ユーザ名重複 |

---

### POST /auth/signin
ログインしてセッションを発行します (有効期間 24 時間)。

**必須ヘッダー**: `X-Turnstile-Session`

**リクエスト**
```json
{
  "username": "testuser",
  "password": "password123"
}
```

**レスポンス** `200`
```json
{
  "data": {
    "sessionId": "session-id",
    "userId": "user-id",
    "username": "testuser",
    "expiresAt": "2024-01-02T00:00:00.000Z"
  }
}
```

**エラー**
| コード | HTTP | 説明 |
|---|---|---|
| `INVALID_CREDENTIALS` | 401 | ユーザ名またはパスワード誤り |

---

### POST /auth/logout
ログアウトします。

**必須ヘッダー**: `X-Session-Id`

**レスポンス** `204 No Content`

---

## Identity エンドポイント (ユーザ・グループ管理)

### GET /identity/user/
ユーザ一覧を取得します。

**必須**: `userAdminGroup` メンバー

**レスポンス** `200`
```json
{
  "data": [
    { "id": "...", "username": "...", "primaryGroupId": "...", "createdAt": "..." }
  ]
}
```

---

### GET /identity/user/me
ログイン中のユーザ情報を取得します。

**必須ヘッダー**: `X-Session-Id`

**レスポンス** `200`
```json
{ "data": { "id": "...", "username": "...", "primaryGroupId": "...", "createdAt": "..." } }
```

**エラー**
| コード | HTTP | 説明 |
|---|---|---|
| `UNAUTHORIZED` | 401 | 未ログイン |

---

### GET /identity/user/:id
指定ユーザの情報を取得します。自分または `userAdminGroup` メンバーのみ参照可能。

**必須ヘッダー**: `X-Session-Id`

**レスポンス** `200`
```json
{ "data": { "id": "...", "username": "...", "primaryGroupId": "...", "createdAt": "..." } }
```

**エラー**
| コード | HTTP | 説明 |
|---|---|---|
| `UNAUTHORIZED` | 401 | 未ログイン |
| `FORBIDDEN` | 403 | 権限不足 |
| `USER_NOT_FOUND` | 404 | ユーザ不在 |

---

### PUT /identity/user/:id
ユーザ情報を更新します。自分または `userAdminGroup` メンバーのみ可能。

**必須ヘッダー**: `X-Session-Id`, `X-Turnstile-Session`

**リクエスト**
```json
{ "username": "new-username" }
```

**レスポンス** `200`
```json
{ "data": { "id": "...", "username": "new-username", "primaryGroupId": "...", "createdAt": "..." } }
```

**エラー**
| コード | HTTP | 説明 |
|---|---|---|
| `FORBIDDEN` | 403 | 権限不足 |
| `USERNAME_TAKEN` | 409 | ユーザ名重複 |

---

### DELETE /identity/user/:id
ユーザを削除します。`userAdminGroup` メンバーのみ可能。
`sys-admin` は削除不可。

**必須ヘッダー**: `X-Session-Id`, `X-Turnstile-Session`

**レスポンス** `204 No Content`

**エラー**
| コード | HTTP | 説明 |
|---|---|---|
| `FORBIDDEN` | 403 | 権限不足 |
| `USER_NOT_FOUND` | 404 | ユーザ不在 |
| `CANNOT_DELETE_SYSTEM_USER` | 422 | システムユーザは削除不可 |

---

### PUT /identity/user/:id/password
パスワードを変更します。自分のみ可能。現在のパスワード確認が必要。

**必須ヘッダー**: `X-Session-Id`, `X-Turnstile-Session`

**リクエスト**
```json
{
  "currentPassword": "現在のパスワード",
  "newPassword": "新しいパスワード (8〜100文字)"
}
```

**レスポンス** `200`
```json
{ "data": { "message": "Password changed" } }
```

**エラー**
| コード | HTTP | 説明 |
|---|---|---|
| `INVALID_PASSWORD` | 401 | 現在のパスワード誤り |
| `FORBIDDEN` | 403 | 権限不足 |

---

### GET /identity/group/
グループ一覧を取得します。ログイン済みユーザのみ参照可能。

**必須ヘッダー**: `X-Session-Id`

**レスポンス** `200`
```json
{
  "data": [
    { "id": "group-id", "name": "groupname", "createdAt": "..." }
  ]
}
```

---

### GET /identity/group/:id
グループ情報を取得します。ログイン済みユーザのみ参照可能。

**必須ヘッダー**: `X-Session-Id`

**レスポンス** `200`
```json
{ "data": { "id": "...", "name": "...", "createdAt": "..." } }
```

---

### POST /identity/group/
グループを作成します。`userAdminGroup` メンバーのみ可能。

**必須ヘッダー**: `X-Session-Id`, `X-Turnstile-Session`

**リクエスト**
```json
{ "name": "英数字・_・- のみ、1〜100文字" }
```

**レスポンス** `201`
```json
{ "data": { "id": "...", "name": "...", "createdAt": "..." } }
```

**エラー**
| コード | HTTP | 説明 |
|---|---|---|
| `GROUP_NAME_TAKEN` | 409 | グループ名重複 |

---

### PUT /identity/group/:id
グループ情報を更新します。`userAdminGroup` メンバーのみ可能。
システムグループ (`sys-*`) は変更不可。

**必須ヘッダー**: `X-Session-Id`, `X-Turnstile-Session`

**リクエスト**
```json
{ "name": "new-name" }
```

**レスポンス** `200`
```json
{ "data": { "id": "...", "name": "new-name", "createdAt": "..." } }
```

**エラー**
| コード | HTTP | 説明 |
|---|---|---|
| `CANNOT_MODIFY_SYSTEM_GROUP` | 422 | システムグループは変更不可 |
| `GROUP_NOT_FOUND` | 404 | グループ不在 |

---

### DELETE /identity/group/:id
グループを削除します。`userAdminGroup` メンバーのみ可能。
システムグループ (`sys-*`) は削除不可。

**必須ヘッダー**: `X-Session-Id`, `X-Turnstile-Session`

**レスポンス** `204 No Content`

**エラー**
| コード | HTTP | 説明 |
|---|---|---|
| `CANNOT_DELETE_SYSTEM_GROUP` | 422 | システムグループは削除不可 |
| `GROUP_NOT_FOUND` | 404 | グループ不在 |

---

### POST /identity/group/:id/members
グループにメンバーを追加します。`userAdminGroup` メンバーのみ可能。

**必須ヘッダー**: `X-Session-Id`, `X-Turnstile-Session`

**リクエスト**
```json
{ "userId": "追加するユーザID" }
```

**レスポンス** `204 No Content`

**エラー**
| コード | HTTP | 説明 |
|---|---|---|
| `GROUP_NOT_FOUND` | 404 | グループ不在 |
| `USER_NOT_FOUND` | 404 | ユーザ不在 |

---

### DELETE /identity/group/:id/members/:userId
グループからメンバーを削除します。`userAdminGroup` メンバーのみ可能。

**必須ヘッダー**: `X-Session-Id`, `X-Turnstile-Session`

**レスポンス** `204 No Content`

**エラー**
| コード | HTTP | 説明 |
|---|---|---|
| `MEMBER_NOT_FOUND` | 404 | メンバー不在 |

---

## 掲示板 (Board) エンドポイント

### GET /boards/
板の一覧を取得します。誰でも参照可能。

**レスポンス** `200`
```json
{
  "data": [
    {
      "id": "board-id",
      "ownerUserId": "user-id",
      "ownerGroupId": "group-id",
      "permissions": "15,12,12",
      "name": "板の名前",
      "description": "説明",
      "maxThreads": 1000,
      "maxThreadTitleLength": 200,
      "defaultMaxPosts": 1000,
      "defaultMaxPostLength": 2000,
      "defaultMaxPostLines": 100,
      "defaultMaxPosterNameLength": 50,
      "defaultMaxPosterSubInfoLength": 100,
      "defaultMaxPosterMetaInfoLength": 200,
      "defaultPosterName": "名無し",
      "defaultIdFormat": "daily_hash",
      "defaultThreadOwnerUserId": null,
      "defaultThreadOwnerGroupId": null,
      "defaultThreadPermissions": "15,12,12",
      "createdAt": "2024-01-01T00:00:00.000Z",
      "adminMeta": { "...": "管理者のみ表示" }
    }
  ]
}
```

---

### POST /boards/
板を作成します。`bbsAdminGroup` メンバーのみ可能。

**必須ヘッダー**: `X-Session-Id`, `X-Turnstile-Session`

**リクエスト**
```json
{
  "id": "board-slug (省略可、デフォルトはUUID)",
  "name": "板の名前 (必須)",
  "description": "説明 (省略可)",
  "ownerUserId": "所有者ユーザID (省略時は作成者)",
  "ownerGroupId": "所有者グループID (省略時は作成者のプライマリグループ)",
  "permissions": "15,12,12",
  "maxThreads": 1000,
  "maxThreadTitleLength": 200,
  "defaultMaxPosts": 1000,
  "defaultMaxPostLength": 2000,
  "defaultMaxPostLines": 100,
  "defaultMaxPosterNameLength": 50,
  "defaultMaxPosterSubInfoLength": 100,
  "defaultMaxPosterMetaInfoLength": 200,
  "defaultPosterName": "名無し",
  "defaultIdFormat": "daily_hash",
  "defaultThreadOwnerUserId": null,
  "defaultThreadOwnerGroupId": null,
  "defaultThreadPermissions": "15,12,12"
}
```

`defaultIdFormat` の値: `daily_hash` | `daily_hash_or_user` | `api_key_hash` | `api_key_hash_or_user` | `none`

**レスポンス** `201` — 作成した板オブジェクト

**エラー**
| コード | HTTP | 説明 |
|---|---|---|
| `VALIDATION_ERROR` | 400 | バリデーション失敗 |
| `UNAUTHORIZED` | 401 | 未ログイン |
| `FORBIDDEN` | 403 | 権限不足 |

---

### PUT /boards/:boardId
板のメタ情報を更新します。板の ADMIN 権限が必要。

**必須ヘッダー**: `X-Session-Id`, `X-Turnstile-Session`

**リクエスト** (すべて省略可)
```json
{
  "name": "新しい板名",
  "description": "新しい説明",
  "maxThreads": 500,
  "defaultMaxPosts": 500,
  "defaultMaxPostLength": 1000,
  "defaultPosterName": "名無しさん",
  "defaultIdFormat": "daily_hash"
}
```

**レスポンス** `200` — 更新後の板オブジェクト

**エラー**
| コード | HTTP | 説明 |
|---|---|---|
| `FORBIDDEN` | 403 | 権限不足 |
| `BOARD_NOT_FOUND` | 404 | 板不在 |

---

### DELETE /boards/:boardId
板を削除します (CASCADE: スレッド・投稿も削除)。板の DELETE 権限が必要。

**必須ヘッダー**: `X-Session-Id`, `X-Turnstile-Session`

**レスポンス** `204 No Content`

**エラー**
| コード | HTTP | 説明 |
|---|---|---|
| `FORBIDDEN` | 403 | 権限不足 |
| `BOARD_NOT_FOUND` | 404 | 板不在 |

---

## スレッド (Thread) エンドポイント

### GET /boards/:boardId/threads/
スレッド一覧を取得します。板のメタ情報も含みます。誰でも参照可能。

**レスポンス** `200`
```json
{
  "data": {
    "board": { "...板オブジェクト..." },
    "threads": [
      {
        "id": "thread-id",
        "boardId": "board-id",
        "ownerUserId": "user-id",
        "ownerGroupId": "group-id",
        "permissions": "15,12,12",
        "title": "スレッドタイトル",
        "maxPosts": null,
        "maxPostLength": null,
        "maxPostLines": null,
        "maxPosterNameLength": null,
        "maxPosterSubInfoLength": null,
        "maxPosterMetaInfoLength": null,
        "posterName": null,
        "idFormat": null,
        "postCount": 1,
        "createdAt": "...",
        "updatedAt": "...",
        "adminMeta": { "...": "管理者のみ表示" }
      }
    ]
  }
}
```

**エラー**
| コード | HTTP | 説明 |
|---|---|---|
| `BOARD_NOT_FOUND` | 404 | 板不在 |

---

### GET /boards/:boardId/threads/:threadId
スレッドの詳細と投稿一覧を取得します。誰でも参照可能。

**レスポンス** `200`
```json
{
  "data": {
    "thread": { "...スレッドオブジェクト..." },
    "posts": [
      {
        "id": "post-id",
        "threadId": "thread-id",
        "postNumber": 1,
        "userId": null,
        "displayUserId": "abcd123456",
        "posterName": "名無し",
        "posterSubInfo": null,
        "content": "本文",
        "createdAt": "...",
        "adminMeta": { "...": "管理者のみ表示" }
      }
    ]
  }
}
```

**エラー**
| コード | HTTP | 説明 |
|---|---|---|
| `THREAD_NOT_FOUND` | 404 | スレッド不在 |

---

### POST /boards/:boardId/threads/
スレッドを作成します。同時に第1レスも作成されます。板の WRITE 権限が必要。

**必須ヘッダー**: `X-Turnstile-Session`

**リクエスト**
```json
{
  "title": "スレッドタイトル (必須、1〜200文字)",
  "content": "本文 (必須、1〜5000文字)",
  "posterName": "投稿者名 (省略時は板のデフォルト)",
  "posterSubInfo": "sage等 (省略可)"
}
```

**レスポンス** `201`
```json
{
  "data": {
    "thread": { "...スレッドオブジェクト..." },
    "firstPost": { "...投稿オブジェクト..." }
  }
}
```

**エラー**
| コード | HTTP | 説明 |
|---|---|---|
| `VALIDATION_ERROR` | 400 | バリデーション失敗 |
| `FORBIDDEN` | 403 | 権限不足 |
| `BOARD_NOT_FOUND` | 404 | 板不在 |
| `THREAD_LIMIT_REACHED` | 422 | スレッド数上限 |
| `TITLE_TOO_LONG` | 422 | タイトル文字数超過 |
| `CONTENT_TOO_LONG` | 422 | 本文文字数超過 |
| `CONTENT_TOO_MANY_LINES` | 422 | 本文行数超過 |

---

### PUT /boards/:boardId/threads/:threadId
スレッドのメタ情報を更新します。スレッドの ADMIN 権限が必要。

**必須ヘッダー**: `X-Session-Id`, `X-Turnstile-Session`

**リクエスト** (すべて省略可)
```json
{
  "title": "新しいタイトル",
  "maxPosts": 500,
  "posterName": "新しいデフォルト投稿者名",
  "idFormat": "daily_hash"
}
```

**レスポンス** `200` — 更新後のスレッドオブジェクト

**エラー**
| コード | HTTP | 説明 |
|---|---|---|
| `FORBIDDEN` | 403 | 権限不足 |
| `THREAD_NOT_FOUND` | 404 | スレッド不在 |

---

### DELETE /boards/:boardId/threads/:threadId
スレッドを削除します (CASCADE: 投稿も削除)。スレッドの DELETE 権限が必要。

**必須ヘッダー**: `X-Session-Id`, `X-Turnstile-Session`

**レスポンス** `204 No Content`

**エラー**
| コード | HTTP | 説明 |
|---|---|---|
| `FORBIDDEN` | 403 | 権限不足 |
| `THREAD_NOT_FOUND` | 404 | スレッド不在 |

---

## 投稿 (Post) エンドポイント

### POST /boards/:boardId/threads/:threadId/posts/
投稿を作成します。スレッドの WRITE 権限が必要。

**必須ヘッダー**: `X-Turnstile-Session`

**リクエスト**
```json
{
  "content": "本文 (必須、1〜5000文字)",
  "posterName": "投稿者名 (省略時はスレッド→板のデフォルト)",
  "posterSubInfo": "sage等 (省略可)"
}
```

**レスポンス** `201`
```json
{
  "data": {
    "id": "post-id",
    "threadId": "thread-id",
    "postNumber": 2,
    "userId": "user-id or null",
    "displayUserId": "abcd123456",
    "posterName": "名無し",
    "posterSubInfo": null,
    "content": "本文",
    "createdAt": "...",
    "adminMeta": { "...": "管理者のみ表示" }
  }
}
```

**エラー**
| コード | HTTP | 説明 |
|---|---|---|
| `VALIDATION_ERROR` | 400 | バリデーション失敗 |
| `FORBIDDEN` | 403 | 権限不足 |
| `THREAD_NOT_FOUND` | 404 | スレッド不在 |
| `POST_LIMIT_REACHED` | 422 | 投稿数上限 |
| `CONTENT_TOO_LONG` | 422 | 本文文字数超過 |
| `CONTENT_TOO_MANY_LINES` | 422 | 本文行数超過 |

---

### DELETE /boards/:boardId/threads/:threadId/posts/:postId
投稿を削除します。スレッドの DELETE 権限が必要。

**必須ヘッダー**: `X-Session-Id`, `X-Turnstile-Session`

**レスポンス** `204 No Content`

**エラー**
| コード | HTTP | 説明 |
|---|---|---|
| `FORBIDDEN` | 403 | 権限不足 |
| `POST_NOT_FOUND` | 404 | 投稿不在 |

---

## システムグループ

init.sql で事前定義されている固定グループです。

| ID | 名前 | 用途 |
|---|---|---|
| `sys-user-admin-group` | userAdminGroup | ユーザ・グループ管理権限 |
| `sys-bbs-admin-group` | bbsAdminGroup | 掲示板管理権限 (板/スレッド/投稿の `adminMeta` 参照も可) |
| `sys-admin-group` | admin | admin ユーザのプライマリグループ |
| `sys-general-group` | general | 新規ユーザのデフォルトプライマリグループ |

`sys-admin` ユーザはすべてのシステムグループに所属します。

---

## IDフォーマット

投稿者の表示IDの計算方法を指定します。板単位で設定し、スレッド単位で上書き可能です。

| 値 | 説明 |
|---|---|
| `daily_hash` | 全員: userToken + 日付のハッシュ (先頭10文字) |
| `daily_hash_or_user` | 匿名: 日毎ハッシュ / ログイン済み: ユーザID |
| `api_key_hash` | 全員: userToken のハッシュ (先頭10文字) |
| `api_key_hash_or_user` | 匿名: APIキーハッシュ / ログイン済み: ユーザID |
| `none` | 表示なし |

---

## ローカル開発手順

```bash
# 1. 環境変数設定
cp .dev.vars.example .dev.vars
# .dev.vars を編集して ADMIN_INITIAL_PASSWORD を設定

# 2. DB 初期化
npx wrangler d1 execute hono-bbs-db --local --file=schema/init.sql

# 3. サーバ起動
npm run dev

# 4. admin 初期設定
curl -X POST http://localhost:8787/api/v1/auth/setup

# 5. テスト実行
ADMIN_INITIAL_PASSWORD=<your-password> bash test/api_test.sh
```
