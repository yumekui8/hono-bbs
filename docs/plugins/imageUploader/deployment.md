# デプロイガイド: imageUploader プラグイン

---

## 前提

- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/) がインストールされていること
- Cloudflare アカウントを持っていること
- S3 互換ストレージ（Cloudflare R2 / AWS S3 / MinIO 等）の認証情報があること

---

## ストレージ別セットアップ

### Cloudflare R2 を使う場合（推奨）

R2 は Cloudflare エコシステム内で完結するため、レイテンシと転送コストが最小になる。

```bash
# 1. R2 バケット作成
wrangler r2 bucket create my-images

# 2. R2 パブリックアクセスを有効化 (ダッシュボードで操作)
#    Cloudflare Dashboard → R2 → バケット → Settings → Public Access を有効化
#    カスタムドメインを設定することも可能

# 3. R2 API トークン作成 (ダッシュボードで操作)
#    Cloudflare Dashboard → My Profile → API Tokens → Create Token
#    テンプレート: Cloudflare R2 → 対象バケットに Object Read & Write 権限

# 4. wrangler.jsonc に設定
S3_ENDPOINT = "https://<ACCOUNT_ID>.r2.cloudflarestorage.com"
S3_BUCKET   = "my-images"
S3_REGION   = "auto"
IMAGE_PUBLIC_BASE_URL = "https://pub-<HASH>.r2.dev"  # パブリック URL、またはカスタムドメイン
```

### AWS S3 を使う場合

```bash
# 1. S3 バケット作成 (AWS コンソールまたは CLI)
aws s3 mb s3://my-bbs-images --region ap-northeast-1

# 2. パブリックアクセス設定
#    バケットポリシーで s3:GetObject を * に許可するか、CloudFront 経由で配信

# 3. IAM ユーザ作成・アクセスキー発行
#    必要な権限: s3:PutObject, s3:DeleteObject (特定バケットのみ)

# 4. wrangler.jsonc に設定
S3_ENDPOINT = "https://s3.ap-northeast-1.amazonaws.com"  # パス形式
S3_BUCKET   = "my-bbs-images"
S3_REGION   = "ap-northeast-1"
IMAGE_PUBLIC_BASE_URL = "https://my-bbs-images.s3.ap-northeast-1.amazonaws.com"
# または CloudFront URL: "https://dXXXXXXXXXXXX.cloudfront.net"
```

> **注意**: このプラグインは **パス形式 URL** を使用する。AWS S3 のバーチャルホスト形式 (`https://<bucket>.s3.amazonaws.com`) には対応していない。S3_ENDPOINT にはバケット名を含めず、リージョンエンドポイントのみを指定する。

### MinIO を使う場合

```bash
# wrangler.jsonc に設定
S3_ENDPOINT = "https://minio.example.com"
S3_BUCKET   = "my-images"
S3_REGION   = "us-east-1"  # MinIO はリージョン文字列を任意に設定可能
IMAGE_PUBLIC_BASE_URL = "https://minio.example.com/my-images"
```

---

## デプロイ手順

### 1. リポジトリを取得して依存関係をインストール

```bash
cd plugins/imageUploader
npm install   # 親プロジェクトの node_modules を共有している場合は不要
```

### 2. wrangler.jsonc を作成

```bash
cp wrangler.example.jsonc wrangler.jsonc
```

`wrangler.jsonc` を編集して以下を設定する。

| 設定項目 | 説明 |
|---|---|
| `d1_databases[].database_id` | D1 データベース ID |
| `kv_namespaces[0].id` | IMAGE_KV のネームスペース ID |
| `kv_namespaces[1].id` | SESSION_KV のネームスペース ID (turnstileApiToken と共有) |
| `vars.S3_ENDPOINT` | S3 互換エンドポイント |
| `vars.S3_BUCKET` | バケット名 |
| `vars.S3_REGION` | リージョン |
| `vars.S3_ACCESS_KEY_ID` | アクセスキー ID |
| `vars.IMAGE_PUBLIC_BASE_URL` | 画像公開 URL ベース |

### 3. D1 データベースを作成・初期化

```bash
# データベース作成
wrangler d1 create image-uploader-db

# database_id を wrangler.jsonc の d1_databases[].database_id に設定してから実行
wrangler d1 execute image-uploader-db --remote --file=schema/init.sql
```

ローカル開発では `--local` フラグを使う。

```bash
wrangler d1 execute image-uploader-db --local --file=schema/init.sql
```

既存の DB を初期化し直す場合:

```bash
wrangler d1 execute image-uploader-db --remote --command "DROP TABLE IF EXISTS images;"
wrangler d1 execute image-uploader-db --remote --file=schema/init.sql
```

既存テーブルに `delete_token` カラムを追加する場合（マイグレーション）:

```bash
wrangler d1 execute image-uploader-db --remote --file=schema/migrate_v2.sql
```

### 4. KV ネームスペースを作成

```bash
# レート制限用 KV (オプション: 未設定時はレート制限が無効)
wrangler kv namespace create image-uploader-kv
# → 表示された id を wrangler.jsonc の kv_namespaces[0].id に設定

# Turnstile 連携用 KV (ENABLE_TURNSTILE=true のとき)
# → turnstileApiToken プラグインが使用している SESSION_KV の id を使う
#    wrangler.jsonc の kv_namespaces[1].id に設定
# → IMAGE_KV と SESSION_KV を同じ KV ネームスペースにすることも可能 (キープレフィックスが異なるため競合しない)
```

### 5. シークレットを設定

```bash
wrangler secret put S3_SECRET_ACCESS_KEY   # S3/R2 シークレットキー
wrangler secret put ADMIN_API_KEY          # 管理者 API キー (任意の文字列)
```

### 6. デプロイ

```bash
wrangler deploy
```

---

## ルーティング設定

Cloudflare Workers のルーティングは `wrangler.jsonc` の `routes` で設定する。

```jsonc
"routes": [
  {
    "pattern": "api.example.com/images/*",
    "zone_name": "example.com"
  }
]
```

**注意**: 同一ドメイン・同一パスに複数の Worker をデプロイすることはできない（後からデプロイしたものが上書きされる）。hono-bbs 本体と同じドメインを使う場合はパスを分けること。

| Worker | パス例 |
|---|---|
| hono-bbs 本体 | `/api/v1/*` |
| turnstileApiToken | `/auth/turnstile` |
| imageUploader | `/api/images/*` |

---

## Cron Trigger 設定

`wrangler.jsonc` の `triggers.crons` でスケジュールを設定する。

```jsonc
"triggers": {
  "crons": ["0 * * * *"]   // 毎時 0 分
}
```

よく使うスケジュール例:

| cron 式 | 実行タイミング |
|---|---|
| `"0 * * * *"` | 毎時 0 分 |
| `"0 0 * * *"` | 毎日 0:00 UTC |
| `"0 */6 * * *"` | 6 時間おき |

Cron は Cloudflare の分散環境で実行されるため、完全に正確な時刻には実行されない場合がある。

---

## ローカル開発

```bash
# D1 をローカル初期化 (初回のみ)
wrangler d1 execute image-uploader-db --file=schema/init.sql --local

# 開発サーバー起動
wrangler dev

# Cron Trigger を手動実行
curl "http://localhost:8787/__scheduled?cron=*+*+*+*+*"
```

ローカル開発時は `ENABLE_TURNSTILE` を未設定にすることで Turnstile 検証をスキップできる。

S3 への Presigned URL は実際の S3/R2 エンドポイントを指すため、ローカル開発でも有効な認証情報が必要になる。MinIO をローカルで動かすことで完全にオフラインで開発することも可能。

---

## 本番運用チェックリスト

- [ ] `ADMIN_API_KEY` に十分なランダム文字列を設定している（32文字以上推奨）
- [ ] `S3_SECRET_ACCESS_KEY` を `wrangler secret put` で設定している（`vars` に直書きしていない）
- [ ] `CORS_ORIGIN` を許可するフロントエンドのオリジンのみに絞っている
- [ ] `ALLOWED_CONTENT_TYPES` を用途に合わせて設定している
- [ ] `MAX_IMAGE_SIZE` でファイルサイズ上限を設けている
- [ ] `IMAGE_TTL_DAYS` で不要画像の自動削除期間を設定している
- [ ] `UPLOAD_RATE_LIMIT` を設定する場合は `IMAGE_KV` も必ずバインドしている
- [ ] Cron Trigger が有効になっていることを Cloudflare ダッシュボードで確認している
- [ ] R2 / S3 バケットのパブリックアクセス設定が意図通りになっている
- [ ] `schema/init.sql`（または `migrate_v2.sql`）を本番 D1 に適用済みであること

---

## トラブルシューティング

### Presigned URL でアップロードが `SignatureDoesNotMatch` になる

- `Content-Type` ヘッダーが `POST /upload/request` で申告した `contentType` と完全一致していることを確認する
- 時刻のズレが原因の場合、署名は UTC 時刻ベースのため Worker の実行環境は自動で同期されており問題ないはず
- `S3_REGION` が正しいか確認する（R2 は `auto`）

### Cron Trigger が動かない

- `wrangler.jsonc` の `triggers.crons` が正しく設定されているか確認する
- `wrangler deploy` し直して設定を反映させる
- Cloudflare ダッシュボード → Workers → `image-uploader` → Triggers で Cron の状態を確認する

### D1 に書き込めない / `delete_token` 関連で 500 になる

- `wrangler d1 execute ... --remote --file=schema/init.sql` でスキーマが初期化されているか確認する
- `wrangler.jsonc` の `d1_databases[].database_id` が正しいか確認する
- 既存テーブルに `delete_token` カラムが未追加の場合は `schema/migrate_v2.sql` を実行する

### レート制限が効かない

- `IMAGE_KV` が `wrangler.jsonc` にバインドされているか確認する（未設定時は無制限動作）
- `UPLOAD_RATE_LIMIT` が `0` または未設定になっていないか確認する
