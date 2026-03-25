# 管理者運用ガイド

このドキュメントは hono-bbs を運用する管理者向けの手順書です。
ユーザー・ロール管理、掲示板管理、セキュリティ運用について説明します。

---

## 管理者ロールの種類

hono-bbs には以下のシステムロールがあります。

| ロール ID | 用途 |
|---|---|
| `admin-role` | システム管理者。すべての権限チェックをバイパスする。初期 admin ユーザが所属 |
| `user-admin-role` | ユーザー・ロール管理 (作成/編集/削除)。`adminMeta` の閲覧も可能 |
| `general-role` | 新規ユーザーが自動所属するデフォルトロール |

`admin` ユーザは初期状態で `admin-role` と `user-admin-role` の両方に所属しており、
あらゆる操作が可能です。

> **注意**: 掲示板管理者 (`bbs-admin-group`) という概念はなくなりました。
> 板・スレッド・投稿の管理設定は `PATCH` エンドポイントで直接編集します。
> `admin-role` メンバーは権限チェックをバイパスするため、すべての PATCH 操作が可能です。

---

## 初回セットアップ

### 1. admin パスワードを設定する

```bash
curl -X POST <API_BASE>/auth/setup
```

`ADMIN_INITIAL_PASSWORD` 環境変数に設定したパスワードが admin の初期パスワードになります。

### 2. admin でログイン

```bash
curl -X POST <API_BASE>/auth/login \
  -H "Content-Type: application/json" \
  -H "X-Turnstile-Session: <TURNSTILE_SESSION_ID>" \
  -d '{"id":"admin","password":"<ADMIN_INITIAL_PASSWORD>"}'
```

レスポンスの `sessionId` を以降のリクエストで `X-Session-Id` ヘッダに使用します。

### 3. パスワードを変更する

初期パスワードは運用に適した強力なパスワードへ変更することを推奨します。

```bash
curl -X PUT <API_BASE>/profile/password \
  -H "Content-Type: application/json" \
  -H "X-Session-Id: <SESSION_ID>" \
  -H "X-Turnstile-Session: <TURNSTILE_SESSION_ID>" \
  -d '{
    "currentPassword": "<初期パスワード>",
    "newPassword": "<新しいパスワード>"
  }'
```

### 4. ADMIN_INITIAL_PASSWORD Secret の削除

パスワード変更後は Secret から削除します。

```bash
npx wrangler secret delete ADMIN_INITIAL_PASSWORD
```

> Secret を削除しても既にセットアップ済みの admin パスワードは変わりません。

---

## ユーザー管理

### ユーザー一覧の確認

`user-admin-role` メンバーのみ実行可能です。

```bash
curl <API_BASE>/identity/users \
  -H "X-Session-Id: <ADMIN_SESSION_ID>"
```

### 特定ユーザーの詳細確認

```bash
curl <API_BASE>/identity/users/<USER_ID> \
  -H "X-Session-Id: <ADMIN_SESSION_ID>"
```

### ユーザーの無効化

問題のあるユーザーを `isActive: false` にすることでログインを禁止します。
投稿は残ります。

```bash
curl -X PUT <API_BASE>/identity/users/<USER_ID> \
  -H "Content-Type: application/json" \
  -H "X-Session-Id: <ADMIN_SESSION_ID>" \
  -H "X-Turnstile-Session: <TURNSTILE_SESSION_ID>" \
  -d '{"isActive": false}'
```

### ユーザーの削除

ユーザーを完全に削除します。ユーザーを削除しても投稿は残ります (`user_id` が NULL になります)。

```bash
curl -X DELETE <API_BASE>/identity/users/<USER_ID> \
  -H "X-Session-Id: <ADMIN_SESSION_ID>" \
  -H "X-Turnstile-Session: <TURNSTILE_SESSION_ID>"
```

> システム管理者ユーザー (`ADMIN_USERNAME`) は削除できません。

---

## ロール管理

### ロール一覧

```bash
curl <API_BASE>/identity/roles \
  -H "X-Session-Id: <ADMIN_SESSION_ID>"
```

### カスタムロールの作成

板ごとにアクセス制御ロールを作成できます。

```bash
curl -X POST <API_BASE>/identity/roles \
  -H "Content-Type: application/json" \
  -H "X-Session-Id: <ADMIN_SESSION_ID>" \
  -H "X-Turnstile-Session: <TURNSTILE_SESSION_ID>" \
  -d '{"name": "moderators"}'
```

### ロールへのメンバー追加

```bash
curl -X POST <API_BASE>/identity/roles/moderators/members \
  -H "Content-Type: application/json" \
  -H "X-Session-Id: <ADMIN_SESSION_ID>" \
  -H "X-Turnstile-Session: <TURNSTILE_SESSION_ID>" \
  -d '{"userId": "<対象ユーザーID>"}'
```

### システムロールの制約

以下のシステムロールは変更・削除できません。

| ロール ID | 環境変数 | 用途 |
|---|---|---|
| `admin-role` | — | システム管理者 (変更・削除不可) |
| `user-admin-role` | `USER_ADMIN_ROLE` | ユーザー管理者 |
| `general-role` | — | 新規ユーザーのデフォルトロール |

---

## 掲示板管理

### 板の作成

`admin-role` メンバー (システム管理者) のみ作成できます。

```bash
curl -X POST <API_BASE>/boards \
  -H "Content-Type: application/json" \
  -H "X-Session-Id: <ADMIN_SESSION_ID>" \
  -H "X-Turnstile-Session: <TURNSTILE_SESSION_ID>" \
  -d '{
    "id": "general",
    "name": "雑談板",
    "description": "なんでも話せる板です",
    "defaultIdFormat": "daily_hash",
    "defaultPosterName": "名無しさん",
    "maxThreads": 1000,
    "defaultMaxPosts": 500
  }'
```

### 板のアクセス制御 (PATCH)

板・スレッド・投稿のアクセス権限は `PATCH` エンドポイントで設定します。
`permissions` フィールドは `"admins,members,users,anon"` 形式の 4 値カンマ区切りで、
各値はそのアクター種別が実行できる操作のビットマスクです。

| ビット値 | 操作 |
|---|---|
| `16` | GET (閲覧) |
| `8` | POST (スレッド/投稿の作成) |
| `4` | PUT (内容の更新) |
| `2` | PATCH (設定の変更) |
| `1` | DELETE (削除) |

#### アクター種別

| アクター | 説明 |
|---|---|
| admins | `administrators` フィールドに列挙されたユーザ/ロール |
| members | `members` フィールドに列挙されたユーザ/ロール |
| users | ログイン済みユーザ全員 |
| anon | 未ログインユーザ (匿名) |

各アクターは上位のアクターの操作を継承します。たとえば `admins: 31` の場合、members/users/anon が 0 でも admins はすべての操作が可能です。

**設定例**:

```bash
# 板のアクセス制御を設定 (誰でも閲覧可、ログイン済みのみ投稿可)
curl -X PATCH <API_BASE>/boards/general \
  -H "Content-Type: application/json" \
  -H "X-Session-Id: <ADMIN_SESSION_ID>" \
  -H "X-Turnstile-Session: <TURNSTILE_SESSION_ID>" \
  -d '{
    "permissions": "31,31,24,16"
  }'
```

**典型的な権限パターン**:

```jsonc
// 誰でも閲覧・書き込み可
"permissions": "31,31,31,24"

// 閲覧は誰でも可、スレッド作成はログイン済みユーザーのみ
"permissions": "31,31,24,16"

// 板メンバーのみ書き込み可、全員閲覧可
"permissions": "31,31,16,16"

// 読み取り専用 (誰も書き込めない、管理者のみ)
"permissions": "31,16,16,16"
```

### 板の `administrators` と `members` の設定

`PATCH /boards/:boardId` で板の管理者・メンバーを設定できます。

```bash
curl -X PATCH <API_BASE>/boards/general \
  -H "Content-Type: application/json" \
  -H "X-Session-Id: <ADMIN_SESSION_ID>" \
  -H "X-Turnstile-Session: <TURNSTILE_SESSION_ID>" \
  -d '{
    "administrators": "moderators",
    "members": "general-role"
  }'
```

- `administrators` / `members`: ユーザ ID またはロール ID のカンマ区切り文字列
- `$CREATOR` プレースホルダを使用すると、作成者の ID に自動展開されます
- `$PARENTS` プレースホルダを使用すると、親リソースの administrators/members を継承します

---

## 書き込み者の追跡 (adminMeta)

`admin-role` または `user-admin-role` のメンバーとしてログインすると、
板・スレッド・投稿のレスポンスに `adminMeta` フィールドが含まれます。

```json
"adminMeta": {
  "creatorUserId": "31592d2e-a098-4fde-9bc1-72fd8d11a9f0",
  "creatorSessionId": "09403bb0-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
  "creatorTurnstileSessionId": "a1b2c3d4-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
}
```

| フィールド | 意味 |
|---|---|
| `creatorUserId` | 作成したユーザーのID (null は匿名) |
| `creatorSessionId` | 作成時のログインセッションID |
| `creatorTurnstileSessionId` | 作成時の Turnstile セッションID |

Turnstile セッションIDは KV に保存されます (有効期限は turnstileApiToken プラグインの `TURNSTILE_TOKEN_TTL` 環境変数で設定可能、デフォルト 1 年)。
期限切れ後は照合できません。問題のある投稿があった場合は速やかに確認することを推奨します。

---

## セッション管理

### セッションの仕組み

| 種別 | 有効期間 | 保存先 |
|---|---|---|
| ログインセッション (`X-Session-Id`) | 24 時間 | Cloudflare KV |
| Turnstile セッション (`X-Turnstile-Session`) | `TURNSTILE_TOKEN_TTL` 分 (デフォルト 1 年 / `0` で無期限) | Cloudflare KV |

KV の TTL により期限切れセッションは自動削除されます。

### KV のセッション確認 (Wrangler)

```bash
# KV の全キー一覧 (デバッグ用)
npx wrangler kv key list --namespace-id <KV_NAMESPACE_ID>
```

---

## 運用上の推奨事項

### セキュリティ

- admin のパスワードは 16 文字以上の強力なものを使用する
- `ADMIN_INITIAL_PASSWORD` は初期設定後に Secret から削除する
- 本番環境では `ENABLE_TURNSTILE=true` を設定して Turnstile セッション検証を有効化する
- `admin-role` のメンバーは最小限に抑える (通常は admin ユーザのみでよい)

### 監視

- Cloudflare Dashboard の Workers Analytics でリクエスト数やエラー率を監視する
- 異常な投稿が増えた場合は `adminMeta` で書き込み者を特定する

### バックアップ

D1 データベースのバックアップ:

```bash
# D1 の内容をエクスポート (Wrangler)
npx wrangler d1 export hono-bbs-db --remote --output=backup-$(date +%Y%m%d).sql
```

定期的にバックアップを取ることを推奨します。

---

## トラブルシューティング

### ログインできない

- パスワードが正しいか確認する
- `POST /auth/setup` が実行済みか確認する (`ALREADY_SETUP` エラーが出れば実行済み)
- Turnstile セッションが必要なため、先に `POST /auth/turnstile` を実行する

### 板が作成できない

- `admin-role` に所属しているか確認する (`GET /profile` でロール情報を確認)
- Turnstile セッション (`X-Turnstile-Session`) が含まれているか確認する

### 投稿・スレッド作成で Turnstile エラーが出る

- `X-Turnstile-Session` ヘッダが含まれているか確認する
- Turnstile セッションは 24 時間有効。期限切れの場合は `POST /auth/turnstile` で再発行する
- 開発環境でスキップしたい場合は `.dev.vars` で `ENABLE_TURNSTILE` を設定しない (またはコメントアウトする)
  (本番では必ず `ENABLE_TURNSTILE=true` を設定すること)

### adminMeta が見えない

- `admin-role` または `user-admin-role` のメンバーとしてログインしているか確認する
- `X-Session-Id` ヘッダが正しく設定されているか確認する
