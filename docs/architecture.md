# アーキテクチャ設計書

## 概要

Hono + Cloudflare Workers + D1 を使用した匿名掲示板 API バックエンド。
JAMStack 構成のフロントエンドから利用されることを想定した API サーバー専用リポジトリ。

---

## 技術スタック

| 項目 | 採用技術 |
|---|---|
| Runtime | Cloudflare Workers |
| Framework | Hono v4 |
| Language | TypeScript |
| DB | Cloudflare D1 (SQLite 互換) |
| KV Store | Cloudflare KV |
| Validation | zod |
| Package Manager | npm |

---

## ディレクトリ構造

```
hono-bbs/
├── src/
│   ├── index.ts            # エントリポイント (Workers fetch handler)
│   ├── index.node.ts       # Node.js ローカル開発用エントリポイント
│   ├── routes/             # Hono ルーティング定義
│   ├── handlers/           # HTTP リクエスト/レスポンス処理
│   ├── services/           # ビジネスロジック + zod バリデーション
│   ├── repository/         # D1 / SQLite アクセス (SQL 直書き)
│   ├── middleware/         # Hono ミドルウェア
│   ├── adapters/           # DB/KV の Workers ↔ Node.js 差異を吸収
│   ├── types/              # 型定義
│   └── utils/              # 汎用ユーティリティ
├── schema/
│   └── init.sql            # DB 初期スキーマ + システムデータ
├── plugins/
│   ├── twoCh/              # 2ch 互換 dat プロトコル Worker
│   ├── datImport/          # dat ファイルインポート管理 Worker
│   └── turnstileApiToken/  # Turnstile トークン発行 Worker
└── docs/                   # ドキュメント
```

---

## レイヤー構成

```
リクエスト
  ↓
[index.ts]          CORS処理 / ベースパス除去 / Workers fetch handler
  ↓
[middleware]        認証コンテキスト / ドメイン制限 / リクエストサイズ制限
  ↓
[routes]            Hono ルーティング定義 (app.get/post/put/delete)
  ↓
[handlers]          リクエストパース / サービス呼び出し / レスポンス返却
  ↓
[services]          ビジネスロジック / zod バリデーション / 権限チェック
  ↓
[repository]        SQL クエリ実行 (D1/SQLite)
```

### 各レイヤーの責務

| レイヤー | 責務 | 禁止事項 |
|---|---|---|
| routes | ルーティング定義のみ | ロジック記述 |
| handlers | HTTP 入出力処理 | ビジネスロジック記述 |
| services | ビジネスロジック / バリデーション | 直接 DB アクセス |
| repository | SQL 発行 / 結果マッピング | ビジネスロジック記述 |

---

## ファイル別の役割

### `src/index.ts` — Workers エントリポイント

- `export default { fetch }` で Workers に登録
- **CORS ヘッダー付与**: `CORS_ORIGIN` 環境変数に基づき `Access-Control-Allow-Origin` を設定
- **ベースパス除去**: `API_BASE_PATH`（デフォルト `/api/v1`）を URL から除去して内部ルーターに転送
- OPTIONS preflight リクエストを処理

### `src/index.node.ts` — Node.js ローカル開発用エントリポイント

- `@hono/node-server` を使用してローカルサーバーを起動
- D1/KV を SQLite/メモリアダプターに差し替えてローカル動作させる
- 本番コードとは別ファイルのため、Workers デプロイ時には使われない

---

### `src/routes/` — ルーティング定義

| ファイル | ルートプレフィックス | 主な内容 |
|---|---|---|
| `auth.ts` | `/auth` | ログイン / ログアウト / admin 初期設定 |
| `identity.ts` | `/identity` | ユーザ管理 / ロール管理 / メンバー管理 |
| `profile.ts` | `/profile` | 自分のプロフィール管理 |
| `boards.ts` | `/boards` | 掲示板 / スレッド / 投稿 CRUD |

ルート定義のみを記述し、ロジックはハンドラーに委譲する。

---

### `src/handlers/` — HTTP 処理

| ファイル | 担当 |
|---|---|
| `authHandler.ts` | 認証 (login/logout/setup/Turnstile) |
| `identityHandler.ts` | ユーザ・ロール・メンバー操作 |
| `profileHandler.ts` | プロフィール・パスワード変更・アカウント削除 |
| `boardHandler.ts` | 掲示板 CRUD |
| `threadHandler.ts` | スレッド CRUD + 投稿一覧取得 / 削除済み投稿マスク |
| `postHandler.ts` | 投稿 CRUD / 削除済み投稿マスク |

**削除済み投稿のマスク処理**: `maskDeletedPost()` 関数で、`isDeleted=true` の投稿は
`posterName` / `posterOptionInfo` / `content` を環境変数 `DELETED_POSTER_NAME` /
`DELETED_CONTENT` の値（デフォルト: 空文字）に置き換えてレスポンスする。
表示テキストの制御はフロントエンド側で行う前提。

---

### `src/services/` — ビジネスロジック

| ファイル | 担当 |
|---|---|
| `authService.ts` | ログイン認証 / セッション発行 / Turnstile 検証 |
| `identityService.ts` | ユーザ登録・更新 / ロール管理 / パスワードハッシュ化 |
| `boardService.ts` | 掲示板作成・更新・削除 / 権限チェック |
| `threadService.ts` | スレッド作成 (第1レス同時作成) / 更新・削除 / 権限チェック |
| `postService.ts` | 投稿作成・更新・ソフトデリート / 権限チェック |

各サービスファイルには **zod スキーマ定義** と **parse 関数** を持ち、
ハンドラーから呼ばれる前に外部入力を検証する。

---

### `src/repository/` — DB アクセス

| ファイル | 担当 |
|---|---|
| `userRepository.ts` | `users` テーブル CRUD |
| `roleRepository.ts` | `roles` / `user_roles` テーブル CRUD |
| `sessionRepository.ts` | KV へのセッション保存・取得・削除 |
| `boardRepository.ts` | `boards` テーブル CRUD |
| `threadRepository.ts` | `threads` テーブル CRUD + 投稿一覧結合取得 |
| `postRepository.ts` | `posts` テーブル CRUD + ソフトデリート |

全 SQL は **プレースホルダー (`?`) を使ったパラメータバインディング** で記述し、
SQL インジェクションを防止している。文字列結合による動的クエリは使用しない。

---

### `src/middleware/` — Hono ミドルウェア

| ファイル | 役割 |
|---|---|
| `adapters.ts` | DB/KV アダプターをコンテキストにセット (`c.set('db', ...)`) |
| `auth.ts` | `X-Session-Id` ヘッダーからセッション取得・認証コンテキスト設定 |
| `domain.ts` | `BBS_ALLOW_DOMAIN` に基づく Host ヘッダーチェック |
| `requestSize.ts` | `MAX_REQUEST_SIZE` に基づくリクエストボディサイズ制限 |
| `turnstile.ts` | `X-Turnstile-Session` ヘッダー検証 (POST/PUT/DELETE に適用) |

#### `auth.ts` が設定するコンテキスト変数

| 変数 | 型 | 内容 |
|---|---|---|
| `userId` | `string \| null` | ログイン中のユーザ ID |
| `userRoleIds` | `string[]` | ユーザが所属するロール ID 一覧 |
| `isSysAdmin` | `boolean` | admin ユーザかどうか |
| `isUserAdmin` | `boolean` | `USER_ADMIN_ROLE` 所属かどうか |
| `db` | `DbAdapter` | D1/SQLite アダプター |
| `kv` | `KvAdapter` | KV アダプター |

---

### `src/adapters/` — アダプター

Workers 環境と Node.js ローカル環境の差異を吸収する薄いラッパー層。

| ファイル | 役割 |
|---|---|
| `db.ts` | `DbAdapter` インターフェース定義 + D1 / better-sqlite3 実装 |
| `kv.ts` | `KvAdapter` インターフェース定義 + Cloudflare KV / Map 実装 |

---

### `src/types/` — 型定義

| ファイル | 内容 |
|---|---|
| `index.ts` | `AppEnv` (Hono の型パラメータ)、`Board` / `Thread` / `Post` / `User` / `Role` 型 |

`AppEnv.Bindings` に全環境変数を定義しており、`c.env.XXX` でアクセスする。
`AppEnv.Variables` にミドルウェアがセットするコンテキスト変数を定義。

---

### `src/utils/` — ユーティリティ

| ファイル | 役割 |
|---|---|
| `constants.ts` | システムロール ID / ユーザ ID の定数定義 |
| `hash.ts` | 匿名投稿者 ID のハッシュ生成 |
| `password.ts` | パスワードのハッシュ化・検証 (PBKDF2) |
| `permission.ts` | 権限ビットマスクのパース・チェック |
| `zodHelper.ts` | ZodError 判定・エラーメッセージ整形 |

#### 権限システム (`permission.ts`)

権限は `"GET,POST,PUT,DELETE"` 形式の文字列で管理する。
各値は `owner=8 / group=4 / auth=2 / anon=1` のビットマスク。

```
例: "15,4,0,0"
  GET:    15 → 全員 (owner+group+auth+anon)
  POST:    4 → グループメンバー以上
  PUT:     0 → 不可
  DELETE:  0 → 不可
```

`isSysAdmin` または `isUserAdmin` が true の場合は権限チェックをバイパス。

---

## DB スキーマ

`schema/init.sql` にすべてのテーブル定義と初期データを集約。

### テーブル一覧

| テーブル | 内容 |
|---|---|
| `users` | ユーザ情報 (id, password_hash, display_name, bio, email) |
| `roles` | ロール (id, name, description) |
| `user_roles` | ユーザとロールの多対多関係 |
| `boards` | 掲示板 (id, name, permissions, ...) |
| `threads` | スレッド (id, board_id, title, permissions, post_count, ...) |
| `posts` | 投稿 (id, thread_id, post_number, content, is_deleted, ...) |

### 初期データ (init.sql)

| ID | 種別 | 説明 |
|---|---|---|
| `sys-admin` | ユーザ | システム管理者 (`ADMIN_USERNAME` で変更可) |
| `admin-role` | ロール | admin ユーザのロール (全権限) |
| `user-admin-role` | ロール | ユーザ管理者ロール (`USER_ADMIN_ROLE` で変更可) |
| `general-role` | ロール | 新規登録ユーザのデフォルトロール |

### セッション・Turnstile セッション (KV)

- D1 ではなく Cloudflare KV (`SESSION_KV`) に保存
- キー: `{KV_PREFIX}session:{sessionId}` / `{KV_PREFIX}edge_token:{token}`
- TTL 設定により自動削除

---

## リクエスト処理フロー

### 認証付きリクエスト例: `POST /api/v1/boards/:boardId`

```
1. index.ts         ベースパス (/api/v1) を除去 → /boards/:boardId に転送
2. domainRestrict   Host ヘッダーチェック (BBS_ALLOW_DOMAIN 設定時)
3. requestSizeLimit リクエストボディサイズチェック
4. setupAdapters    DB/KV アダプターをコンテキストにセット
5. authContext      X-Session-Id ヘッダーからセッション取得 → userId/userRoleIds を設定
6. routes/boards.ts ルートマッチング → createThreadHandler へ
7. turnstile MW     X-Turnstile-Session ヘッダー検証
8. createThreadHandler  リクエストボディをパース
9. threadService.parseCreateThread  zod でバリデーション
10. threadService.createThread      権限チェック + ビジネスロジック
11. threadRepository.createThread   D1 にプレースホルダーで INSERT
12. レスポンス生成 (201 Created)
13. index.ts        CORS ヘッダー付与してレスポンス返却
```

---

## セキュリティ設計

### SQL インジェクション対策

全 DB クエリを **D1 のパラメータバインディング** (`db.prepare(sql).bind(...params)`) で実行。
文字列結合による動的 SQL は使用しない。

### 入力バリデーション

外部入力（リクエストボディ・クエリパラメータ・パスパラメータ）は
**zod スキーマ** でバリデーション後にサービス層へ渡す。
バリデーションエラーは `400 VALIDATION_ERROR` で返却する。

### 認証・認可

- ログインセッション: KV に保存した UUID セッション (`X-Session-Id` ヘッダー)
- Turnstile: 書き込み操作に `X-Turnstile-Session` ヘッダーを必須化（`ENABLE_TURNSTILE=true` 時）
- 権限チェック: `src/utils/permission.ts` でビットマスク評価

### エラー情報の制御

- サービス層の例外は handler で捕捉し、**エラーコードのみ**をクライアントに返す
- スタックトレース等の内部情報は `console.error` のみ（クライアントには非公開）

---

## プラグイン構成

本体と **DB (D1) を共有**する独立した Cloudflare Workers プロジェクト群。
プラグインは本体の API を呼ばず、直接 D1 を参照する。

| プラグイン | 機能 |
|---|---|
| `plugins/twoCh/` | 2ch 互換 dat 形式プロトコルの読み書き (2ch ブラウザ対応) |
| `plugins/datImport/` | 5ch dat ファイルを hono-bbs DB にインポート |
| `plugins/turnstileApiToken/` | Cloudflare Turnstile トークン発行・検証 |

各プラグインのセットアップ手順は `docs/plugins/` 配下を参照。

---

## CORS と BBS_ALLOW_DOMAIN の違い

| 設定 | チェック対象 | 用途 |
|---|---|---|
| `CORS_ORIGIN` | `Origin` ヘッダー | ブラウザの CORS ポリシー制御 |
| `BBS_ALLOW_DOMAIN` | `Host` ヘッダー | サーバーサイドのドメイン制限 |

- `CORS_ORIGIN`: 「どのオリジンのブラウザからのリクエストを許可するか」をブラウザに伝える
- `BBS_ALLOW_DOMAIN`: 「どのドメイン宛のリクエストをこの Worker で受け付けるか」をサーバー側でチェック

Cloudflare Workers では複数のカスタムドメインを同一 Worker に向けることができる。
`BBS_ALLOW_DOMAIN` を設定すると、意図しないドメイン経由のアクセスを `403` で拒否できる。
両者の役割は重複しない。
