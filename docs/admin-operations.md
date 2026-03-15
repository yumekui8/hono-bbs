# 管理者運用ガイド

このドキュメントは hono-bbs を運用する管理者向けの手順書です。
ユーザー・グループ管理、掲示板管理、セキュリティ運用について説明します。

---

## 管理者アカウントの種類

hono-bbs には 2 種類の管理権限があります。

| グループ | ID | 権限 |
|---|---|---|
| **userAdminGroup** | `user-admin-group` | ユーザー・グループの作成/編集/削除 |
| **bbsAdminGroup** | `bbs-admin-group` | 掲示板・スレッド・投稿の管理、書き込み者の追跡 (`adminMeta` 参照) |

管理者ユーザー (`ADMIN_USERNAME`、デフォルト: `admin`) は両グループに初期から所属しています。

---

## 初回ログインとパスワード変更

### 1. admin でログイン

```bash
curl -X POST <API_BASE>/auth/login \
  -H "Content-Type: application/json" \
  -d '{"id":"admin","password":"<ADMIN_INITIAL_PASSWORD>"}'
```

レスポンスの `sessionId` を以降のリクエストで `X-Session-Id` ヘッダに使用します。

### 2. パスワードを変更する

初期パスワードは運用に適した強力なパスワードへ変更することを推奨します。

```bash
# まず自分のユーザーIDを確認
curl <API_BASE>/profile \
  -H "X-Session-Id: <SESSION_ID>"

# パスワード変更
curl -X PUT <API_BASE>/identity/users/<USER_ID>/password \
  -H "Content-Type: application/json" \
  -H "X-Session-Id: <SESSION_ID>" \
  -d '{
    "currentPassword": "<現在のパスワード>",
    "newPassword": "<新しいパスワード>"
  }'
```

### 3. ADMIN_INITIAL_PASSWORD Secret の削除

パスワード変更後は環境変数に残す必要がありません。削除します。

```bash
npx wrangler secret delete ADMIN_INITIAL_PASSWORD
```

> Secret を削除しても既にセットアップ済みの admin パスワードは変わりません。
> `POST /auth/setup` は一度しか成功しないため、再実行しても無効です。

---

## ユーザー管理

### ユーザー一覧の確認

```bash
curl <API_BASE>/identity/user \
  -H "X-Session-Id: <ADMIN_SESSION_ID>"
```

### 特定ユーザーの詳細確認

```bash
curl <API_BASE>/identity/users/<USER_ID> \
  -H "X-Session-Id: <ADMIN_SESSION_ID>"
```

### ユーザーの削除

問題のあるユーザーを削除します。ユーザーを削除しても投稿は残ります (`user_id` が NULL になります)。

```bash
curl -X DELETE <API_BASE>/identity/users/<USER_ID> \
  -H "X-Session-Id: <ADMIN_SESSION_ID>" \
  -H "X-Turnstile-Session: <TURNSTILE_SESSION_ID>"
```

> システム管理者ユーザー (`ADMIN_USERNAME`) は削除できません。

### bbsAdminGroup への追加

掲示板管理者を増やしたい場合、ユーザーを `bbs-admin-group` に追加します。

```bash
curl -X POST <API_BASE>/identity/groups/bbs-admin-group/members \
  -H "Content-Type: application/json" \
  -H "X-Session-Id: <ADMIN_SESSION_ID>" \
  -H "X-Turnstile-Session: <TURNSTILE_SESSION_ID>" \
  -d '{"userId": "<対象ユーザーID>"}'
```

---

## グループ管理

### グループ一覧

```bash
curl <API_BASE>/identity/group \
  -H "X-Session-Id: <ADMIN_SESSION_ID>"
```

### カスタムグループの作成

板ごとにアクセス制御グループを作成することができます。

```bash
curl -X POST <API_BASE>/identity/group \
  -H "Content-Type: application/json" \
  -H "X-Session-Id: <ADMIN_SESSION_ID>" \
  -H "X-Turnstile-Session: <TURNSTILE_SESSION_ID>" \
  -d '{"name": "moderators"}'
```

### システムグループの制約

`USER_ADMIN_GROUP`・`BBS_ADMIN_GROUP` 環境変数で指定されたグループ、および admin のプライマリグループは変更・削除できません:

| デフォルト グループID | 環境変数 | 用途 |
|---|---|---|
| `user-admin-group` | `USER_ADMIN_GROUP` | ユーザー管理者 |
| `bbs-admin-group` | `BBS_ADMIN_GROUP` | 掲示板管理者 |
| `admin-group` | — | admin プライマリグループ |
| `general-group` | — | 新規ユーザーのデフォルトグループ |

---

## 掲示板管理

### 板の作成

bbsAdminGroup メンバーのみ作成できます。

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

### 板のアクセス制御

`permissions` フィールドで `"owner,group,auth,anon"` 形式のビットマスクを指定します。
各値はそのユーザー種別が実行できる操作のビットマスクです。

| ビット値 | 操作 |
|---|---|
| `8` | GET (閲覧) |
| `4` | POST (作成) |
| `2` | PUT (更新) |
| `1` | DELETE (削除) |

組み合わせ例:
- `15` = 全操作 (GET+POST+PUT+DELETE)
- `12` = GET+POST (閲覧+書き込みのみ)
- `8` = GET のみ (読み取り専用)
- `0` = すべて拒否

**設定例**:

```jsonc
// 誰でも閲覧・書き込み可 (オーナー/グループは全操作、auth/anonはGET+POST)
"permissions": "15,15,12,12"

// 閲覧は誰でも可、スレッド作成はログインユーザーのみ、匿名は閲覧のみ
"permissions": "15,15,12,8"

// bbsAdminGroup/オーナーのみスレッド作成可、全員閲覧可
"permissions": "15,15,8,8"
```

---

## 書き込み者の追跡 (adminMeta)

bbsAdminGroup または userAdminGroup のメンバーとしてログインすると、
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

Turnstile セッションIDは KV に保存されます (有効期限は `TURNSTILE_TOKEN_TTL` 環境変数で設定可能、デフォルト 1 年)。
期限切れ後は照合できません。問題のある投稿があった場合は速やかに確認することを推奨します。

### 管理者として板一覧を取得する例

```bash
curl <API_BASE>/boards \
  -H "X-Session-Id: <ADMIN_SESSION_ID>"

# レスポンスに adminMeta が含まれる
```

---

## セッション管理

### セッションの仕組み

| 種別 | 有効期間 | 保存先 |
|---|---|---|
| ログインセッション (`X-Session-Id`) | 24 時間 | Cloudflare KV |
| Turnstile セッション (`X-Turnstile-Session`) | `TURNSTILE_TOKEN_TTL` 分 (デフォルト 1 年 / `0` で無期限) | Cloudflare KV |

KV の TTL により期限切れセッションは自動削除されます。
手動でのセッション無効化は現在サポートされていません (ユーザーのログアウトを待つか、KV から手動削除)。

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
- 本番環境では `DISABLE_TURNSTILE` を絶対に設定しない
- bbsAdminGroup のメンバーは最小限に抑える

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
- Turnstile セッションが必要な場合は先に `POST /auth/turnstile` を実行する

### 板が作成できない

- bbsAdminGroup (`bbs-admin-group`) に所属しているか確認する
  ```bash
  curl <API_BASE>/profile -H "X-Session-Id: <SESSION_ID>"
  # primaryGroupId や所属グループを確認
  curl <API_BASE>/identity/groups/bbs-admin-group -H "X-Session-Id: <SESSION_ID>"
  ```

### 投稿・スレッド作成で Turnstile エラーが出る

- `X-Turnstile-Session` ヘッダが含まれているか確認する
- Turnstile セッションは 24 時間有効。期限切れの場合は `POST /auth/turnstile` で再発行する
- 開発環境でスキップしたい場合は `.dev.vars` に `DISABLE_TURNSTILE=true` を設定する
  (本番では絶対に使用しないこと)

### adminMeta が見えない

- bbsAdminGroup または userAdminGroup のメンバーとしてログインしているか確認する
- `X-Session-Id` ヘッダが正しく設定されているか確認する
