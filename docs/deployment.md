# デプロイガイド

hono-bbs は Cloudflare Workers だけでなく、Linux サーバー (Node.js/Bun) にもデプロイできます。

---

## 目次

- [Cloudflare Workers へのデプロイ](#cloudflare-workers-へのデプロイ)
- [Linux サーバーへのデプロイ (Node.js)](#linux-サーバーへのデプロイ-nodejs)
- [Docker でのデプロイ](#docker-でのデプロイ)
- [プラグインのデプロイ](#プラグインのデプロイ)
  - [turnstileApiToken を Linux サーバーにデプロイ](#pluginsturnstileapitoken-を-linux-サーバーにデプロイ)
  - [twoCh を Linux サーバーにデプロイ](#pluginstwoch-を-linux-サーバーにデプロイ)
- [DB マイグレーション](#db-マイグレーション)
- [環境変数リファレンス](./env-vars.md)

---

## Cloudflare Workers へのデプロイ

### 前提条件

- Cloudflare アカウント
- `wrangler` CLI (npm でインストール済み)
- Node.js 18 以上

### 手順

#### 1. 依存パッケージのインストール

```bash
npm install
```

#### 2. Cloudflare リソースの作成

```bash
# D1 データベースを作成
npx wrangler d1 create hono-bbs-db

# KV ネームスペースを作成
npx wrangler kv namespace create SESSION_KV
```

#### 3. wrangler.jsonc の設定

```bash
cp wrangler.example.jsonc wrangler.jsonc
```

`wrangler.jsonc` を編集し、上で作成した `database_id` と KV の `id` を設定します。

#### 4. DB の初期化

```bash
# 本番 D1 を初期化
npx wrangler d1 execute hono-bbs-db --file=schema/init.sql

# ローカル開発用 D1 を初期化
npx wrangler d1 execute hono-bbs-db --local --file=schema/init.sql
```

#### 5. シークレットの設定

```bash
npx wrangler secret put ADMIN_INITIAL_PASSWORD
```

Turnstile セッション検証を有効にする場合は `wrangler.jsonc` の `vars` に追加します:

```jsonc
"vars": {
  "ENABLE_TURNSTILE": "true"
}
```

> **Note**: `TURNSTILE_SITE_KEY` / `TURNSTILE_SECRET_KEY` は **turnstileApiToken プラグイン** 側の設定です。hono-bbs 本体は `ENABLE_TURNSTILE` と `SESSION_KV` のみを参照します。

#### 6. デプロイ

```bash
npx wrangler deploy
```

#### 7. admin 初期設定

```bash
curl -X POST https://your-worker.workers.dev/api/v1/auth/setup \
  -H "Content-Type: application/json" \
  -d '{"password":"<ADMIN_INITIAL_PASSWORD>"}'
```

---

## Linux サーバーへのデプロイ (Node.js)

### 前提条件

- Node.js 18 以上 (または Bun 1 以上)
- MySQL / PostgreSQL / SQLite のいずれか
- Redis (オプション、セッション管理用)

### 手順

#### 1. 依存パッケージのインストール

```bash
npm install

# DB ドライバー (使用するものをインストール)
npm install better-sqlite3   # SQLite (デフォルト)
npm install mysql2            # MySQL
npm install pg                # PostgreSQL

# KV ドライバー (Redis を使用する場合)
npm install ioredis

# Node.js サーバー
npm install @hono/node-server
```

#### 2. 環境変数の設定

```bash
cp .dev.vars.example .env
```

`.env` を編集:

```env
# DB 設定 (SQLite の場合)
DB_DRIVER=sqlite
DATABASE_URL=./data/hono-bbs.db

# DB 設定 (MySQL の場合)
# DB_DRIVER=mysql
# DATABASE_URL=mysql://user:password@localhost:3306/hono_bbs

# DB 設定 (PostgreSQL の場合)
# DB_DRIVER=postgresql
# DATABASE_URL=postgresql://user:password@localhost:5432/hono_bbs

# KV 設定 (メモリ: 開発用)
KV_DRIVER=memory

# KV 設定 (Redis の場合)
# KV_DRIVER=redis
# REDIS_URL=redis://localhost:6379

# 複数インスタンス運用時のプレフィックス
# KV_PREFIX=prod:

# API 設定
API_BASE_PATH=/api/v1
ADMIN_INITIAL_PASSWORD=your-secure-password
CORS_ORIGIN=https://your-frontend.example.com

# Turnstile セッション検証を有効にする場合 (turnstileApiToken プラグインと連携時)
# ENABLE_TURNSTILE=true
```

#### 3. DB の初期化

```bash
# SQLite
node -e "
const Database = require('better-sqlite3');
const fs = require('fs');
const db = new Database('./data/hono-bbs.db');
db.exec(fs.readFileSync('./schema/init.sql', 'utf8'));
"

# MySQL / MariaDB
mysql -u user -p hono_bbs < schema/init.mysql.sql

# PostgreSQL
psql -U user -d hono_bbs -f schema/init.postgresql.sql
```

#### 4. Node.js サーバーの起動

```bash
node src/index.node.ts
# または
npx tsx src/index.node.ts
```

#### 5. systemd サービス設定 (本番運用)

`/etc/systemd/system/hono-bbs.service`:

```ini
[Unit]
Description=hono-bbs API Server
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=/opt/hono-bbs
EnvironmentFile=/opt/hono-bbs/.env
ExecStart=/usr/bin/node /opt/hono-bbs/src/index.node.ts
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl enable hono-bbs
sudo systemctl start hono-bbs
```

---

## Docker でのデプロイ

### Dockerfile の例

```dockerfile
FROM node:22-alpine

WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

ENV DB_DRIVER=sqlite
ENV DATABASE_URL=/data/hono-bbs.db
ENV KV_DRIVER=memory
ENV API_BASE_PATH=/api/v1

VOLUME ["/data"]
EXPOSE 8787

CMD ["node", "src/index.node.ts"]
```

### Docker Compose の例 (MySQL + Redis)

```yaml
version: "3.9"
services:
  api:
    build: .
    ports:
      - "8787:8787"
    environment:
      DB_DRIVER: mysql
      DATABASE_URL: mysql://hono_bbs:password@db:3306/hono_bbs
      KV_DRIVER: redis
      REDIS_URL: redis://redis:6379
      API_BASE_PATH: /api/v1
      ADMIN_INITIAL_PASSWORD: your-secure-password
    depends_on:
      - db
      - redis

  db:
    image: mysql:8
    environment:
      MYSQL_ROOT_PASSWORD: rootpassword
      MYSQL_DATABASE: hono_bbs
      MYSQL_USER: hono_bbs
      MYSQL_PASSWORD: password
    volumes:
      - db_data:/var/lib/mysql
      - ./schema/init.sql:/docker-entrypoint-initdb.d/init.sql

  redis:
    image: redis:7-alpine
    volumes:
      - redis_data:/data

volumes:
  db_data:
  redis_data:
```

---

## プラグインのデプロイ

各プラグインは独立した Worker/サービスとしてデプロイします。

| プラグイン | Cloudflare Workers | Linux Node.js | ドキュメント |
|---|---|---|---|
| turnstileApiToken | ✅ | ✅ | `plugins/turnstileApiToken/` |
| twoCh | ✅ | ✅ | [docs/plugins/twoCh/deploy.md](./plugins/twoCh/deploy.md) |
| imageUploader | ✅ | - | `plugins/imageUploader/` |
| datImport | ✅ | - | `plugins/datImport/` |

### D1 / KV の共有設定

hono-bbs 本体とプラグインで D1 および KV を共有します。

```
hono-bbs 本体
  ├─ DB (D1 / SQLite / MySQL)   ── twoCh プラグインと共有
  └─ SESSION_KV (KV / Redis)    ── twoCh / turnstileApiToken プラグインと共有可能
                                    (KV_PREFIX でキー衝突を防止)
```

**KV を共有する場合の設定例 (Cloudflare Workers):**

```jsonc
// wrangler.jsonc (hono-bbs 本体)
"kv_namespaces": [{ "binding": "SESSION_KV", "id": "abc123..." }],
"vars": { "KV_PREFIX": "prod:" }

// wrangler.jsonc (twoCh プラグイン) — 同じ KV ID / KV_PREFIX を設定
"kv_namespaces": [{ "binding": "SESSION_KV", "id": "abc123..." }],
"vars": { "KV_PREFIX": "prod:" }
```

---

### plugins/turnstileApiToken を Linux サーバーにデプロイ

```bash
cd /opt/hono-bbs

# 依存パッケージ (Redis を使う場合)
npm install @hono/node-server ioredis

# 環境変数ファイル
cat > plugins/turnstileApiToken/.env << 'EOF'
TURNSTILE_SITE_KEY=your-site-key
TURNSTILE_SECRET_KEY=your-secret-key
KV_DRIVER=redis
REDIS_URL=redis://localhost:6379
KV_PREFIX=prod:
TURNSTILE_PATH=/auth/turnstile
CORS_ORIGIN=https://your-frontend.example.com
PORT=8788
EOF

# 起動
node plugins/turnstileApiToken/src/index.node.ts
```

**systemd サービス** (`/etc/systemd/system/hono-bbs-turnstile.service`):

```ini
[Unit]
Description=hono-bbs Turnstile Plugin
After=network.target redis.service

[Service]
Type=simple
User=www-data
WorkingDirectory=/opt/hono-bbs
EnvironmentFile=/opt/hono-bbs/plugins/turnstileApiToken/.env
ExecStart=/usr/bin/node /opt/hono-bbs/plugins/turnstileApiToken/src/index.node.ts
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
```

---

### plugins/twoCh を Linux サーバーにデプロイ

hono-bbs 本体と **同じ DB** を指定してください。

```bash
cd /opt/hono-bbs

# 依存パッケージ
npm install @hono/node-server better-sqlite3  # SQLite の場合
# npm install @hono/node-server mysql2        # MySQL の場合

# 環境変数ファイル
cat > plugins/twoCh/.env << 'EOF'
# hono-bbs 本体と同じ DB を指定
DB_DRIVER=sqlite
DATABASE_URL=/opt/hono-bbs/data/hono-bbs.db

# KV (edge-token 管理用, hono-bbs 本体と同じ Redis を共有可)
KV_DRIVER=redis
REDIS_URL=redis://localhost:6379
KV_PREFIX=prod:

# 2ch ブラウザ向け公開URL
SITE_URL=http://2ch.example.com
BBS_NAME=掲示板

# Turnstile 認証 (必要な場合)
# ENABLE_TURNSTILE=true
# TURNSTILE_SITE_KEY=your-site-key
# TURNSTILE_SECRET_KEY=your-secret-key

PORT=8789
EOF

# 起動
node plugins/twoCh/src/index.node.ts
```

**systemd サービス** (`/etc/systemd/system/hono-bbs-twoch.service`):

```ini
[Unit]
Description=hono-bbs twoCh Plugin
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=/opt/hono-bbs
EnvironmentFile=/opt/hono-bbs/plugins/twoCh/.env
ExecStart=/usr/bin/node /opt/hono-bbs/plugins/twoCh/src/index.node.ts
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl enable hono-bbs-twoch
sudo systemctl start hono-bbs-twoch
```

---

## DB マイグレーション

既存 DB にスキーマ変更を適用する場合は `schema/` 以下のマイグレーションファイルを使用します。

| ファイル | 内容 |
|---|---|
| `schema/init.sql` | 全テーブル作成 (SQLite / Cloudflare D1 用) |
| `schema/init.mysql.sql` | 全テーブル作成 (MySQL / MariaDB 用) |
| `schema/init.postgresql.sql` | 全テーブル作成 (PostgreSQL 用) |
| `schema/migrate_add_is_deleted.sql` | posts テーブルに `is_deleted` カラムを追加 (SQLite/D1/PostgreSQL) |

**Cloudflare D1:**

```bash
npx wrangler d1 execute hono-bbs-db --file=schema/migrate_add_is_deleted.sql
# ローカル D1 に適用する場合
npx wrangler d1 execute hono-bbs-db --local --file=schema/migrate_add_is_deleted.sql
```

**SQLite:**

```bash
sqlite3 ./data/hono-bbs.db < schema/migrate_add_is_deleted.sql
```

**MySQL / PostgreSQL:**

```bash
mysql -u user -p hono_bbs < schema/migrate_add_is_deleted.sql
# または
psql -U user -d hono_bbs -f schema/migrate_add_is_deleted.sql
```

---

## ローカル開発

```bash
# 依存パッケージのインストール
npm install

# ローカル DB の初期化
npx wrangler d1 execute hono-bbs-db --local --file=schema/init.sql

# 開発サーバーの起動
npm run dev

# admin パスワードの初期設定
curl -X POST http://localhost:8787/api/v1/auth/setup \
  -H "Content-Type: application/json" \
  -d '{"password":"password"}'

# ログイン
curl -X POST http://localhost:8787/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"id":"admin","password":"password"}'
```
