# datImport プラグイン

5ch 形式の dat ファイルを hono-bbs にインポートする管理者用 Cloudflare Worker。

---

## 概要

```
POST /admin/datimport?board=<boardId>
  ↓  (multipart/form-data: id, password, dat)
  ↓  管理者認証 (hono-bbs D1 の users テーブルで検証)
  ↓  Shift-JIS → UTF-8 変換
  ↓  dat 形式パース
  ↓  hono-bbs D1 に thread + posts 挿入
  ↓
{ data: { threadId, boardId, postCount } }
```

インポート操作は `ADMIN_ROLE` 環境変数で指定したロール (`admin-role` デフォルト) に
所属するユーザのみ実行できます。これは hono-bbs のシステム管理者ロールに相当します。

---

## dat ファイル形式

5ch の dat 形式 (Shift-JIS エンコード):

```
名前<>メール欄<>日付 ID<>本文<>スレタイトル
名前<>メール欄<>日付 ID<>本文<>
...
```

- **1 行目**: 5 番目のフィールドがスレッドタイトル
- **2 行目以降**: スレッドタイトルなし (空)
- **日付フォーマット**: `2023/01/15(日) 12:34:56.78 ID:abc12345` (JST)
- **本文**: `<br>` による改行を含む

---

## エンドポイント仕様

### `POST /admin/datimport`

#### クエリパラメータ

| パラメータ | 必須 | 説明 |
|---|---|---|
| `board` | ✅ | インポート先の板 ID |

#### リクエスト

`Content-Type: multipart/form-data`

| フィールド | 必須 | 説明 |
|---|---|---|
| `id` | ✅ | 管理者ユーザ ID |
| `password` | ✅ | 管理者パスワード |
| `dat` | ✅ | Shift-JIS エンコードされた dat ファイル |

#### レスポンス

- `201 Created`

```json
{
  "data": {
    "threadId": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
    "boardId": "general",
    "postCount": 1000,
    "message": "Imported 1000 posts into thread '...'"
  }
}
```

#### エラー

| コード | HTTP | 説明 |
|---|---|---|
| `VALIDATION_ERROR` | 400 | 必須パラメータ不足、Content-Type 不正、dat が空 |
| `UNAUTHORIZED` | 401 | 管理者 ID またはパスワードが不正 |
| `FORBIDDEN` | 403 | `ADMIN_ROLE` で指定したロール非所属 |
| `NOT_FOUND` | 404 | 指定した板が存在しない |

---

## セットアップ

### 1. wrangler.jsonc を作成

```bash
cd plugins/datImport
cp wrangler.example.jsonc wrangler.jsonc
```

`wrangler.jsonc` を編集して以下を設定する。

| 設定項目 | 説明 |
|---|---|
| `d1_databases[].database_id` | hono-bbs と **同じ** D1 データベース ID |

### 2. デプロイ

```bash
wrangler deploy
```

### 3. ルーティング設定 (任意)

hono-bbs 本体と同一ドメインを使う場合はパスを分けること。

```jsonc
"routes": [
  {
    "pattern": "api.example.com/dat/*",
    "zone_name": "example.com"
  }
]
```

---

## ローカル開発

```bash
cd plugins/datImport
wrangler dev
# → http://localhost:8787 で起動
```

---

## インポートスクリプト

```bash
./scripts/import.sh \
  --url https://dat-import.example.workers.dev \
  --board general \
  --file ./thread12345.dat \
  --admin-id admin \
  --admin-password mypassword
```

環境変数でも設定可能:

```bash
export DATIMPORT_URL=https://dat-import.example.workers.dev
export DATIMPORT_ADMIN_ID=admin
export DATIMPORT_PASSWORD=mypassword

./scripts/import.sh --board general --file ./thread12345.dat
```

---

## 環境変数

| 変数名 | 必須 | デフォルト | 説明 |
|---|---|---|---|
| `ADMIN_ROLE` | | `admin-role` | インポート操作を許可するロール ID。hono-bbs の `admin-role` と同じ値にすること |
| `BASE_PATH` | | *(なし)* | エンドポイントのベースパス (例: `/dat`) |
| `CORS_ORIGIN` | | `*` | 許可する CORS オリジン |

---

## DB カラムとのマッピング

インポート時に dat フィールドをどの DB カラムに格納するかのマッピングです。

| dat フィールド | DB カラム | 説明 |
|---|---|---|
| 名前欄 | `poster_name` | 投稿者名 |
| メール欄 | `poster_option_info` | sage 等のオプション情報 |
| 日付+ID部分のID | `author_id` | 日付内の ID 文字列 (`ID:abc12345` の部分) |
| 本文 | `content` | 投稿本文 (`<br>` を `\n` に変換して保存) |

スレッドの `permissions` は板の `default_thread_permissions` を使用します。
投稿の `permissions` は板の `default_post_permissions` を使用します。

---

## 注意事項

- このプラグインは hono-bbs 本体の D1 データベースを **直接共有** する
- インポートしたスレッド・投稿の `creator_user_id` にはログインした管理者 ID が記録される
- `creator_session_id` と `creator_turnstile_session_id` は NULL になる
- インポートされた投稿の日時は dat ファイルの日付 (JST→UTC 変換) を使用する
- dat ファイルの文字コードは必ず **Shift-JIS** であること
