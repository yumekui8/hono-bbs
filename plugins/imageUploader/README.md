# imageUploader Plugin

匿名ユーザーでも利用可能な画像アップロード機能を提供する Cloudflare Workers プラグイン。

S3互換ストレージ（Cloudflare R2, AWS S3, MinIO 等）への **Presigned PUT URL** を発行し、ブラウザから直接ストレージへアップロードする構成です。Worker はファイルバイトを経由せず、認可・メタデータ管理のみを担当します。

---

## アーキテクチャ

```
[ブラウザ]
  │
  ├─ POST /upload/request ──→ [このWorker]
  │                              │ Presigned PUT URL 発行
  │                              │ D1 に pending レコード作成
  │                              ↓
  ├─ PUT <presignedUrl> ────→ [R2 / S3 / MinIO]
  │   (直接アップロード)
  │
  └─ POST /upload/confirm/:id → [このWorker]
                                  │ pending → active に遷移
                                  ↓
                              {image, url} を返却
```

Turnstile セッションを使ったレート制限を行う場合は、[turnstileApiToken プラグイン](../turnstileApiToken/) と同じ SESSION_KV ネームスペースを共有します。

---

## ファイル構成

```
plugins/imageUploader/
  src/
    index.ts       # Worker エントリポイント (fetch + scheduled)
    types.ts       # PluginEnv, Image 型定義
    routes.ts      # Hono ルーティング + Turnstile/Admin ミドルウェア
    handler.ts     # 全 HTTP ハンドラ
    presign.ts     # AWS Signature V4 Presigned PUT URL / DELETE
    repository.ts  # D1 CRUD (画像メタデータ)
    rateLimit.ts   # KV を使ったレート制限
    cleanup.ts     # 自動削除ロジック (Cron Trigger 用)
  schema/
    init.sql       # D1 テーブル定義
  wrangler.example.jsonc
```

---

## セットアップ

### 1. wrangler.jsonc を作成

```bash
cp wrangler.example.jsonc wrangler.jsonc
```

### 2. D1 データベースを作成・初期化

```bash
wrangler d1 create image-uploader-db
# 表示された database_id を wrangler.jsonc に設定する

wrangler d1 execute image-uploader-db --file=schema/init.sql
```

### 3. KV ネームスペースを作成

```bash
wrangler kv namespace create image-uploader-kv
# 表示された id を wrangler.jsonc の IMAGE_KV に設定する
```

### 4. シークレットを設定

```bash
wrangler secret put S3_SECRET_ACCESS_KEY   # S3/R2 シークレットキー
wrangler secret put ADMIN_API_KEY          # 管理者 API キー
```

### 5. デプロイ

```bash
wrangler deploy
```

---

## 環境変数

| 変数名 | 必須 | デフォルト | 説明 |
|---|---|---|---|
| `IMAGE_DB` | ✅ | - | D1 データベース binding |
| `IMAGE_KV` | ✅ | - | レート制限用 KV binding |
| `S3_ENDPOINT` | ✅ | - | S3 互換エンドポイント URL |
| `S3_BUCKET` | ✅ | - | バケット名 |
| `S3_REGION` | ✅ | - | リージョン (R2: `auto`) |
| `S3_ACCESS_KEY_ID` | ✅ | - | アクセスキー ID |
| `S3_SECRET_ACCESS_KEY` | ✅ | - | シークレットキー (secret) |
| `IMAGE_PUBLIC_BASE_URL` | ✅ | - | 画像公開 URL のベース |
| `ENABLE_TURNSTILE` | | `false` | `true` で Turnstile セッション検証を有効化 |
| `SESSION_KV` | | - | Turnstile 用 KV (hono-bbs と共有, ENABLE_TURNSTILE=true 時必須) |
| `UPLOAD_RATE_LIMIT` | | `0` (無制限) | 単位時間内の最大アップロード数 |
| `UPLOAD_RATE_WINDOW` | | `60` | レート制限の単位時間 (分) |
| `PRESIGNED_URL_TTL` | | `300` | Presigned URL の有効期限 (秒) |
| `MAX_IMAGE_SIZE` | | `0` (無制限) | 最大ファイルサイズ (バイト) |
| `ALLOWED_CONTENT_TYPES` | | `image/jpeg,image/png,image/gif,image/webp` | 許可 MIME タイプ |
| `IMAGE_TTL_DAYS` | | `0` (無期限) | 画像保持日数 (Cron で自動削除) |
| `ADMIN_API_KEY` | | - | 管理者 API キー (secret) |
| `CORS_ORIGIN` | | `*` | 許可 CORS オリジン (カンマ区切り) |

---

## エンドポイント

### POST `/upload/request`

Presigned PUT URL を発行します。

**Headers:**
- `X-Turnstile-Session: <token>` — ENABLE_TURNSTILE=true のとき必須

**Body:**
```json
{
  "contentType": "image/jpeg",
  "filename": "photo.jpg",     // 省略可
  "size": 102400               // 省略可 (バイト単位、上限チェックに使用)
}
```

**Response:**
```json
{
  "data": {
    "imageId": "550e8400-...",
    "uploadUrl": "https://...",
    "uploadUrlExpiresAt": "2024-01-01T00:05:00.000Z",
    "contentType": "image/jpeg"
  }
}
```

クライアントは `uploadUrl` に対して以下のように PUT します:
```
PUT <uploadUrl>
Content-Type: image/jpeg

<バイナリデータ>
```

`Content-Type` ヘッダーは署名済みのため、`contentType` と完全一致している必要があります。

---

### POST `/upload/confirm/:imageId`

アップロード完了を通知し、画像を公開状態 (`active`) にします。

**Response:**
```json
{
  "data": {
    "image": { "id": "...", "status": "active", ... },
    "url": "https://images.example.com/images/550e8400-..."
  }
}
```

---

### GET `/images/:imageId`

画像のメタデータと公開 URL を取得します。

---

### PUT `/images/:imageId/attach`

画像を掲示板の投稿に紐付けます (`active` な画像のみ)。

```json
{ "postId": "some-post-id" }
```

---

### POST `/images/:imageId/report`

画像を通報します。`active` → `reported` に遷移し、`report_count` がインクリメントされます。

---

### DELETE `/images/:imageId`

管理者が画像を削除します。ストレージと D1 の両方から削除されます。

**Headers:**
- `Authorization: Bearer <ADMIN_API_KEY>`

---

## 自動削除 (Cron Trigger)

`wrangler.jsonc` の `triggers.crons` で指定したスケジュールで自動削除が実行されます。

削除対象:
1. `expires_at` が現在時刻より前の画像 (IMAGE_TTL_DAYS で設定)
2. `pending` のまま 1 時間以上経過した画像 (アップロード放棄)

---

## R2 での使用例

```bash
# R2 バケット作成
wrangler r2 bucket create my-images

# R2 API トークンの取得 (Cloudflare ダッシュボードで生成)
# パーミッション: Object Read & Write (特定バケットのみ)

# wrangler.jsonc の設定
S3_ENDPOINT=https://<ACCOUNT_ID>.r2.cloudflarestorage.com
S3_BUCKET=my-images
S3_REGION=auto
IMAGE_PUBLIC_BASE_URL=https://pub-xxx.r2.dev  # R2 パブリックアクセス URL
```

## レート制限について

レート制限は **Fixed Window** 方式で KV を使用しています。KV にはアトミックなインクリメントがないため、高トラフィック時にごく稀に制限が緩くなる場合があります。厳密な制限が必要な場合は Durable Objects の使用を検討してください。
