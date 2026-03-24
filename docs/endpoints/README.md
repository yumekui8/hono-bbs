# エンドポイント仕様書インデックス

ベースパス: `{API_BASE_PATH}` (デフォルト: `/api/v1`)

## 共通仕様

### リクエストヘッダー

| ヘッダー | 用途 |
|---|---|
| `X-Session-Id` | ログインセッションID (`POST /auth/login` で取得) |
| `X-Turnstile-Session` | Turnstile セッションID (turnstileApiToken プラグインで取得)。`ENABLE_TURNSTILE=true` 時の全 POST/PUT/DELETE で必要 |
| `X-User-Token` | 匿名ユーザの displayUserId 計算用トークン |

### レスポンス形式

成功時: `{ "data": <payload> }`
エラー時: `{ "error": "ERROR_CODE", "message": "説明" }`

### 権限ビットマスク

`permissions` フィールドは `"<owner>,<group>,<auth>,<anon>"` 形式。各値はユーザ種別が実行できる操作のビットマスク:

- `8` = GET
- `4` = POST
- `2` = PUT
- `1` = DELETE

例: `"15,14,12,12"` → owner: 全操作, group: GET+POST+PUT, auth: GET+POST, anon: GET+POST

`bbs-admin-group` メンバーは権限チェックをバイパス (`isAdmin=true`)。

### エンドポイント権限情報 (endpoint フィールド)

コレクション系 GET エンドポイント (`GET /boards` など) のレスポンスには、
そのエンドポイント自体の ownership 情報が `endpoint` フィールドとして含まれる。

```json
{
  "data": [...],
  "endpoint": {
    "ownerUserId": "admin",
    "ownerGroupId": "bbs-admin-group",
    "permissions": "15,15,8,8"
  }
}
```

### adminMeta フィールド

板・スレッド・投稿レスポンスに含まれる管理者専用フィールド。
`user-admin-group` または `bbs-admin-group` メンバーのみ参照できる。

### 権限フィルタリング

一覧取得 (`GET /boards`, `GET /boards/:boardId`, `GET /boards/:boardId/:threadId`) では、
クライアントが GET 権限を持たないオブジェクトはレスポンスから自動的に除外される。

---

## エンドポイント一覧

### 認証 (Auth)

| ファイル | エンドポイント | 説明 |
|---|---|---|
| [auth-setup.md](./auth-setup.md) | `GET/POST /auth/setup` | admin 初期パスワード設定 |
| [auth-login.md](./auth-login.md) | `GET/POST /auth/login` | ログイン |
| [auth-logout.md](./auth-logout.md) | `GET/POST /auth/logout` | ログアウト |

> **Note**: `GET/POST /auth/turnstile` は **turnstileApiToken プラグイン** として独立しています。
> 詳細は `plugins/turnstileApiToken/README.md` を参照してください。

### プロフィール (Profile)

| ファイル | エンドポイント | 説明 |
|---|---|---|
| [profile.md](./profile.md) | `GET/PUT/DELETE /profile` | 自分自身のプロフィール管理 (パスワード変更は PUT に統合) |

### Identity

| ファイル | エンドポイント | 説明 |
|---|---|---|
| [identity-users.md](./identity-users.md) | `POST /identity/users` (誰でも可), `GET/PUT/DELETE /identity/users`, `GET/PUT/DELETE /identity/users/:id` | ユーザ管理 |
| [identity-groups.md](./identity-groups.md) | `GET/POST /identity/groups`, `GET/PUT/DELETE /identity/groups/:id`, `POST/DELETE /identity/groups/:id/members/*` | グループ管理 (userAdminGroup 専用) |

### 掲示板 (BBS)

| ファイル | エンドポイント | 説明 |
|---|---|---|
| [boards.md](./boards.md) | `GET/POST /boards`, `PUT/DELETE /boards/:boardId` | 板の一覧・作成・更新・削除 |
| [threads.md](./threads.md) | `GET/POST /boards/:boardId`, `GET/PUT/DELETE /boards/:boardId/:threadId` | スレッドの一覧・作成・更新・削除 |
| [posts.md](./posts.md) | `POST/GET/PUT/DELETE /boards/:boardId/:threadId/*` | 投稿の作成・取得・更新・ソフトデリート |

---

## システムグループ

| ID (デフォルト) | 環境変数 | 説明 |
|---|---|---|
| `user-admin-group` | `USER_ADMIN_GROUP` | ユーザ・グループ管理権限 |
| `bbs-admin-group` | `BBS_ADMIN_GROUP` | 掲示板管理権限・adminMeta 参照権限 |
| `admin-group` | — | admin ユーザのプライマリグループ |
| `general-group` | — | 新規ユーザのデフォルトプライマリグループ |

`admin` ユーザは全システムグループに所属する。
`admin` のユーザIDは `ADMIN_USERNAME` 環境変数で変更可能 (デフォルト: `admin`)。

---

## 環境変数

| 変数名 | 説明 | デフォルト |
|---|---|---|
| `ENABLE_TURNSTILE` | `true` で `X-Turnstile-Session` ヘッダーを SESSION_KV で検証する | — (無効) |
| `ADMIN_INITIAL_PASSWORD` | `POST /auth/setup` で使用する初期パスワード | — |
| `ADMIN_USERNAME` | 管理者ユーザID | `admin` |
| `USER_ADMIN_GROUP` | ユーザ管理グループID | `user-admin-group` |
| `BBS_ADMIN_GROUP` | 掲示板管理グループID | `bbs-admin-group` |
| `ENDPOINT_PERMISSIONS` | エンドポイント権限 JSON | デフォルト値を使用 |
| `MAX_REQUEST_SIZE` | リクエストボディサイズ上限 (例: `1mb`, `500kb`) | 無制限 |
| `API_BASE_PATH` | API ベースパス | `/api/v1` |
| `CORS_ORIGIN` | 許可する CORS オリジン (カンマ区切り) | `*` |
| `BBS_ALLOW_DOMAIN` | 許可するドメイン (カンマ区切り、未設定で制限なし) | — |
| `USER_DISPLAY_LIMIT` | ユーザ一覧の1ページあたり件数 (0=無制限) | `0` |
| `GROUP_DISPLAY_LIMIT` | グループ一覧の1ページあたり件数 (0=無制限) | `0` |
| `DELETED_POSTER_NAME` | ソフトデリート済み投稿の名前欄マスク文字列 | `あぼーん` |
| `DELETED_CONTENT` | ソフトデリート済み投稿の本文マスク文字列 | `このレスは削除されました` |

> **Turnstile 関連の設定** (`TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY`, `TURNSTILE_TOKEN_TTL`, `ALLOW_BBS_UI_DOMAINS`) は **turnstileApiToken プラグイン** 側の設定です。
> hono-bbs 本体が参照するのは `ENABLE_TURNSTILE` と `SESSION_KV` のみです。

### ENDPOINT_PERMISSIONS の形式

```json
{
  "/boards": {
    "ownerUserId": "$SYS_ADMIN",
    "ownerGroupId": "$BBS_ADMIN_GROUP",
    "permissions": "15,15,12,12"
  }
}
```

プレースホルダー:
- `$SYS_ADMIN` → `ADMIN_USERNAME` の値
- `$USER_ADMIN_GROUP` → `USER_ADMIN_GROUP` の値
- `$BBS_ADMIN_GROUP` → `BBS_ADMIN_GROUP` の値
