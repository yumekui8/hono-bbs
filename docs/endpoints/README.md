# エンドポイント仕様書インデックス

ベースパス: `{API_BASE_PATH}` (デフォルト: `/api/v1`)

---

## 共通仕様

### リクエストヘッダー

| ヘッダー | 用途 |
|---|---|
| `X-Session-Id` | ログインセッションID (`POST /auth/login` で取得) |
| `X-Turnstile-Session` | Turnstile セッションID (turnstileApiToken プラグインで取得)。`ENABLE_TURNSTILE=true` 時の全 POST/PUT/PATCH/DELETE で必要 |

### レスポンス形式

成功時: `{ "data": <payload> }`
エラー時: `{ "error": "ERROR_CODE", "message": "説明" }`

---

## 権限システム

### アクター (4段階)

各リソース (板・スレッド・投稿) には `administrators`、`members`、`permissions` フィールドがあり、誰が何を操作できるかを制御する。

| アクター | 判定条件 |
|---|---|
| **Administrators** | リソースの `administrators` フィールドに userId または roleId が含まれる |
| **Members** | リソースの `members` フィールドに userId または roleId が含まれる |
| **Users** | ログイン済みユーザー |
| **Anonymous** | 未ログインユーザー |

上位アクターは下位の権限を自動的に包含する (Admins ⊇ Members ⊇ Users ⊇ Anonymous)。

**sys admin** (`admin-role` のメンバー) はすべての権限チェックをバイパスする。

### permissions フィールドの形式

`permissions` は `"admins,members,users,anon"` 形式の4値カンマ区切り文字列。各値は実行できる操作のビットマスク (0〜31)。

| ビット値 | 操作 |
|---|---|
| `16` | GET (閲覧) |
| `8` | POST (作成) |
| `4` | PUT (内容更新) |
| `2` | PATCH (設定変更) |
| `1` | DELETE (削除) |

組み合わせ例:
- `31` = 全操作 (GET+POST+PUT+PATCH+DELETE)
- `24` = GET+POST (閲覧+書き込みのみ)
- `16` = GET のみ (読み取り専用)
- `0` = すべて拒否

**設定例:**
```
"31,28,24,16"
 ↑   ↑   ↑   └ 匿名: GET のみ (16)
 ↑   ↑   └─── ログイン済み: GET+POST+PUT (24)
 ↑   └──────── メンバー: GET+POST+PUT+PATCH (28)
 └──────────── 管理者: 全操作 (31)
```

### administrators / members フィールド

カンマ区切りのユーザーIDまたはロールIDを指定する。

```
"admin,moderator-role,user123"
```

板・スレッド・投稿の作成時に `$CREATOR`、`$PARENTS` プレースホルダーを使うことで、作成者や親リソースの管理者を自動引き継ぎできる。

| プレースホルダー | 展開先 |
|---|---|
| `$CREATOR` | 作成者のユーザーID |
| `$PARENTS` | 親リソースの `administrators` フィールドの内容 |

これらのプレースホルダーは書き込み時に展開されて保存される (テンプレートのままは保存されない)。

---

## adminMeta フィールド

板・スレッド・投稿レスポンスに含まれる作成者追跡フィールド。
**`admin-role`** または **`user-admin-role`** のメンバーのみレスポンスに含まれる。

```json
{
  "adminMeta": {
    "creatorUserId": "user123",
    "creatorSessionId": "session-uuid",
    "creatorTurnstileSessionId": "turnstile-uuid"
  }
}
```

---

## 権限フィルタリング

一覧取得 (`GET /boards`、`GET /boards/:boardId`、`GET /boards/:boardId/:threadId`) では、
クライアントが GET 権限を持たないオブジェクトはレスポンスから自動的に除外される。

---

## エンドポイント一覧

### 認証 (Auth)

| ファイル | エンドポイント | 説明 |
|---|---|---|
| [auth-setup.md](./auth-setup.md) | `POST /auth/setup` | admin 初期パスワード設定 (一回限り) |
| [auth-login.md](./auth-login.md) | `POST /auth/login` | ログイン |
| [auth-logout.md](./auth-logout.md) | `POST /auth/logout` | ログアウト |

> **Note**: `GET/POST /auth/turnstile` は **turnstileApiToken プラグイン** として独立しています。
> 詳細は `plugins/turnstileApiToken/README.md` を参照してください。

### プロフィール (Profile)

| ファイル | エンドポイント | 説明 |
|---|---|---|
| [profile.md](./profile.md) | `GET/PUT/DELETE /profile` | 自分自身のプロフィール管理 |

### Identity

| ファイル | エンドポイント | 説明 |
|---|---|---|
| [identity-users.md](./identity-users.md) | `POST /identity/users` (誰でも可), `GET/PUT/DELETE /identity/users/:id` | ユーザー管理 |
| [identity-roles.md](./identity-roles.md) | `GET/POST /identity/roles`, `GET/PUT/DELETE /identity/roles/:id`, `POST/DELETE /identity/roles/:id/members/*` | ロール管理 (userAdminRole 専用) |

### 掲示板 (BBS)

| ファイル | エンドポイント | 説明 |
|---|---|---|
| [boards.md](./boards.md) | `GET/POST /boards`, `PUT/PATCH/DELETE /boards/:boardId` | 板の一覧・作成・更新・削除 |
| [threads.md](./threads.md) | `GET/POST /boards/:boardId`, `GET/PUT/PATCH/DELETE /boards/:boardId/:threadId` | スレッドの一覧・作成・更新・削除 |
| [posts.md](./posts.md) | `POST/GET/PUT/PATCH/DELETE /boards/:boardId/:threadId/*` | 投稿の作成・取得・更新・ソフトデリート |

---

## システムロール

| ID (デフォルト) | 環境変数 | 説明 |
|---|---|---|
| `user-admin-role` | `USER_ADMIN_ROLE` | ユーザー・ロール管理権限、adminMeta 参照権限 |
| `admin-role` | — | sys admin。全権限チェックをバイパス |
| `general-role` | — | 新規ユーザーのデフォルトロール |

`admin` ユーザーは全システムロールに所属する。
`admin` のユーザーIDは `ADMIN_USERNAME` 環境変数で変更可能 (デフォルト: `admin`)。

---

## 主な環境変数

| 変数名 | 説明 | デフォルト |
|---|---|---|
| `ENABLE_TURNSTILE` | `"true"` で `X-Turnstile-Session` ヘッダーを SESSION_KV で検証する | — (無効) |
| `ADMIN_INITIAL_PASSWORD` | `POST /auth/setup` で使用する初期パスワード | — |
| `ADMIN_USERNAME` | 管理者ユーザーID | `admin` |
| `USER_ADMIN_ROLE` | ユーザー管理ロールID | `user-admin-role` |
| `MAX_REQUEST_SIZE` | リクエストボディサイズ上限 (例: `1mb`, `500kb`) | 無制限 |
| `API_BASE_PATH` | API ベースパス | `/api/v1` |
| `CORS_ORIGIN` | 許可する CORS オリジン (カンマ区切り) | `*` |
| `BBS_ALLOW_DOMAIN` | 許可するドメイン (カンマ区切り、未設定で制限なし) | — |
| `USER_DISPLAY_LIMIT` | ユーザー一覧の1ページあたり件数 (0=無制限) | `0` |
| `ROLE_DISPLAY_LIMIT` | ロール一覧の1ページあたり件数 (0=無制限) | `0` |

> **Turnstile 関連の設定** (`TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY` 等) は **turnstileApiToken プラグイン** 側の設定です。
> hono-bbs 本体が参照するのは `ENABLE_TURNSTILE` と `SESSION_KV` のみです。
