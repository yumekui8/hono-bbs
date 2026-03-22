# imageUploader プラグイン仕様書

ソース: `plugins/imageUploader/`

---

## 概要

匿名ユーザーでも利用可能な画像アップロード機能を提供する Cloudflare Workers プラグイン。

S3 互換ストレージ（Cloudflare R2 / AWS S3 / MinIO 等）への **Presigned PUT URL** を発行し、ブラウザがストレージへ直接アップロードする構成をとる。Worker はファイルバイトを経由せず、認可・メタデータ管理のみを担当する。

---

## アーキテクチャ

```
[ブラウザ]
  │
  ├─ POST /upload/request ─────→ [imageUploader Worker]
  │                                  Presigned PUT URL 発行
  │                                  D1 に pending レコード作成
  │                                        │
  │                                        ↓ { imageId, uploadUrl, deleteToken }
  │
  ├─ PUT <uploadUrl> ──────────→ [R2 / S3 / MinIO]
  │   Content-Type: image/jpeg      直接アップロード (Worker を経由しない)
  │
  ├─ POST /upload/confirm/:id ─→ [imageUploader Worker]
  │                                  status: pending → active
  │                                  ↓ { image, url }
  │
  └─ DELETE /images/:id/:token → [imageUploader Worker]
                                    投稿者自身による削除 (deleteToken 使用)
```

---

## hono-bbs との連携

Turnstile セッション検証を有効にする場合 (`ENABLE_TURNSTILE=true`)、hono-bbs 本体および turnstileApiToken プラグインと **同じ SESSION_KV** ネームスペースを共有する。

```
turnstileApiToken プラグイン → SESSION_KV (turnstile:<id> キー書き込み)
imageUploader プラグイン    → SESSION_KV (turnstile:<id> キー読み込み)
hono-bbs 本体              → SESSION_KV (turnstile:<id> キー読み込み)
```

---

## エンドポイント一覧

| ファイル | メソッド | パス | 説明 |
|---|---|---|---|
| [upload.md](./upload.md) | `POST` | `/upload/request` | Presigned PUT URL 発行 |
| [upload.md](./upload.md) | `POST` | `/upload/confirm/:imageId` | アップロード完了確認 |
| [images.md](./images.md) | `GET` | `/images/:imageId` | 画像情報取得 |
| [images.md](./images.md) | `POST` | `/images/:imageId/report` | 通報 |
| [images.md](./images.md) | `DELETE` | `/images/:imageId/:deleteToken` | 投稿者自身による削除 |
| [images.md](./images.md) | `DELETE` | `/images/:imageId` | 管理者削除 |

---

## 共通仕様

### リクエストヘッダー

| ヘッダー | 用途 |
|---|---|
| `X-Turnstile-Session` | Turnstile セッション ID。`ENABLE_TURNSTILE=true` のとき `POST /upload/request` で必須 |
| `Authorization` | `Bearer <ADMIN_API_KEY>` 形式。管理者専用エンドポイントで必須 |

### レスポンス形式

成功時: `{ "data": <payload> }`
エラー時: `{ "error": "ERROR_CODE", "message": "説明" }`

### Image スキーマ

```json
{
  "type": "object",
  "properties": {
    "id":                 { "type": "string", "format": "uuid" },
    "storageKey":         { "type": "string", "description": "ストレージ内のパス (例: images/<uuid>.jpg)" },
    "originalFilename":   { "type": ["string", "null"] },
    "contentType":        { "type": "string", "description": "MIME タイプ (例: image/jpeg)" },
    "size":               { "type": ["integer", "null"], "description": "バイト単位 (クライアント申告値)" },
    "status": {
      "type": "string",
      "enum": ["pending", "active", "reported"],
      "description": "pending: アップロード待ち / active: 公開中 / reported: 通報済み"
    },
    "turnstileSessionId": { "type": ["string", "null"], "description": "アップロード時の Turnstile セッション ID (監査用)" },
    "reportCount":        { "type": "integer", "description": "通報回数" },
    "createdAt":          { "type": "string", "format": "date-time" },
    "confirmedAt":        { "type": ["string", "null"], "format": "date-time" },
    "expiresAt":          { "type": ["string", "null"], "format": "date-time", "description": "自動削除期限 (IMAGE_TTL_DAYS 設定時のみ)" }
  }
}
```

> `deleteToken` は DB に保存されるが、API レスポンスには含まれない。`POST /upload/request` のレスポンスでのみ返される。

---

## 環境変数

### 必須

| 変数名 | 説明 |
|---|---|
| `IMAGE_DB` | D1 データベース binding (画像メタデータ管理) |
| `S3_ENDPOINT` | S3 互換エンドポイント URL (例: `https://<id>.r2.cloudflarestorage.com`) |
| `S3_BUCKET` | バケット名 |
| `S3_REGION` | リージョン (Cloudflare R2 の場合は `auto`) |
| `S3_ACCESS_KEY_ID` | アクセスキー ID |
| `S3_SECRET_ACCESS_KEY` | シークレットキー (`wrangler secret put` で設定) |
| `IMAGE_PUBLIC_BASE_URL` | 画像公開 URL のベース (例: `https://images.example.com`) |

公開 URL は `IMAGE_PUBLIC_BASE_URL` + `/` + `storageKey` で構成される。

### オプション

| 変数名 | デフォルト | 説明 |
|---|---|---|
| `ENABLE_TURNSTILE` | — (無効) | `true` で `X-Turnstile-Session` ヘッダーを SESSION_KV で検証する |
| `SESSION_KV` | — | Turnstile 検証用 KV (hono-bbs / turnstileApiToken と同じネームスペース)。`ENABLE_TURNSTILE=true` のとき必須 |
| `IMAGE_KV` | — (無効) | レート制限用 KV。未設定時はレート制限が無効になる |
| `UPLOAD_RATE_LIMIT` | `0` (無制限) | ウィンドウ内の最大アップロード回数 |
| `UPLOAD_RATE_WINDOW` | `60` | レート制限のウィンドウ幅 (分) |
| `PRESIGNED_URL_TTL` | `300` | Presigned URL の有効期限 (秒) |
| `MAX_IMAGE_SIZE` | `0` (無制限) | 最大ファイルサイズ (バイト)。クライアント申告値で判断 |
| `ALLOWED_CONTENT_TYPES` | `image/jpeg,image/png,image/gif,image/webp` | 許可する MIME タイプ (カンマ区切り) |
| `IMAGE_TTL_DAYS` | `0` (無期限) | 画像保持日数。設定した日数後に Cron Trigger で自動削除 |
| `ADMIN_API_KEY` | — | 管理者 API キー (`wrangler secret put` で設定) |
| `CORS_ORIGIN` | `*` | 許可する CORS オリジン (カンマ区切り) |

---

## セットアップ

```bash
# 1. D1 データベース作成・初期化
wrangler d1 create image-uploader-db
wrangler d1 execute image-uploader-db --remote --file=schema/init.sql

# 2. (オプション) レート制限用 KV 作成
wrangler kv namespace create image-uploader-kv

# 3. wrangler.jsonc 設定
cp wrangler.example.jsonc wrangler.jsonc
# database_id, kv namespace id, 各変数を設定する

# 4. シークレット設定
wrangler secret put S3_SECRET_ACCESS_KEY
wrangler secret put ADMIN_API_KEY

# 5. デプロイ
wrangler deploy
```

---

## 自動削除 (Cron Trigger)

`wrangler.jsonc` の `triggers.crons` で設定したスケジュール（デフォルト: `0 * * * *` = 毎時 0 分）で以下を自動削除する。

| 対象 | 条件 |
|---|---|
| 期限切れ画像 | `expires_at` が現在時刻より前 |
| 放棄画像 | `status = 'pending'` かつ `created_at` が 1 時間以上前 |

削除はストレージと D1 の両方（行を物理削除）で行われる。ストレージ削除失敗時はログ出力のみで D1 の削除はスキップされる。

---

## レート制限

**Sliding Window Log** 方式で KV を使用。

- 識別子: `ENABLE_TURNSTILE=true` のとき Turnstile セッション ID、無効のとき `CF-Connecting-IP` ヘッダーの値
- KV キー: `ratelimit:<識別子>`
- KV 値: アップロードしたエポックミリ秒の配列 (例: `[1700000010000, 1700000020000]`)
- ウィンドウ外のタイムスタンプは次回リクエスト時に自動除去される
- `IMAGE_KV` が未設定の場合はレート制限が無効になる

> **注意**: KV はアトミック操作を持たないため、高トラフィック時にごく稀に制限が緩くなる場合がある。

---

## Presigned PUT URL について

Presigned URL には `content-type` と `host` が署名ヘッダーとして含まれる。そのため、クライアントがアップロード時に指定する `Content-Type` ヘッダーは、`POST /upload/request` で申告した `contentType` と完全一致している必要がある。不一致の場合、ストレージ側で `SignatureDoesNotMatch` エラーが返る。

ストレージキー（`storageKey`）は `images/<uuid>.<ext>` の形式で生成される。拡張子は `contentType` から自動決定される。

署名アルゴリズムは **AWS Signature Version 4** (path-style)。Cloudflare R2, AWS S3, MinIO すべてに対応する。
