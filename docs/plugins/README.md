# プラグイン仕様書インデックス

hono-bbs 本体と連携する独立した Cloudflare Workers プラグインの一覧です。

各プラグインは `plugins/<name>/` に配置され、独自の `wrangler.jsonc` でデプロイします。

---

## プラグイン一覧

| プラグイン | ソース | ドキュメント | 概要 |
|---|---|---|---|
| turnstileApiToken | `plugins/turnstileApiToken/` | [`plugins/turnstileApiToken/README.md`](../../plugins/turnstileApiToken/README.md) | Cloudflare Turnstile チャレンジ・セッション発行 |
| imageUploader | `plugins/imageUploader/` | [`imageUploader/README.md`](./imageUploader/README.md) | S3 互換ストレージへの画像アップロード管理 |
| datImport | `plugins/datImport/` | [`datImport/README.md`](./datImport/README.md) | 5ch dat ファイルを hono-bbs にインポート |

---

## プラグイン間の連携

プラグイン同士は **SESSION_KV** を共有することで疎結合に連携します。

```
[ブラウザ]
  │
  ├─ GET/POST <TURNSTILE_PATH>  → [turnstileApiToken Worker]
  │                                  ↓ SESSION_KV (turnstile:<id> 書き込み)
  │
  ├─ POST /upload/request       → [imageUploader Worker]
  │   X-Turnstile-Session: xxx       ↓ SESSION_KV (turnstile:<id> 読み込み・検証)
  │
  └─ POST /api/v1/boards/:id    → [hono-bbs Worker]
      X-Turnstile-Session: xxx       ↓ SESSION_KV (turnstile:<id> 読み込み・検証)
```

SESSION_KV の共有は **オプション** (`ENABLE_TURNSTILE=true` 時のみ有効)。
各プラグインは独立してデプロイ・動作可能です。

---

## hono-bbs 本体との関係

| 機能 | 場所 |
|---|---|
| Turnstile セッション発行 | turnstileApiToken プラグイン |
| Turnstile セッション検証 | hono-bbs 本体 / imageUploader プラグイン (SESSION_KV 共有) |
| 画像アップロード・管理 | imageUploader プラグイン |
| 掲示板・スレッド・投稿 | hono-bbs 本体 |
| dat ファイルインポート | datImport プラグイン (D1 共有) |

datImport プラグインは hono-bbs 本体と **D1 データベースを直接共有** します。
その他のプラグインとの連携点は SESSION_KV のみです。
