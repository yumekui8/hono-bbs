# エンドポイント: `/auth/turnstile` (移動済み)

> **このエンドポイントは hono-bbs 本体から削除されました。**
>
> Turnstile チャレンジ・セッション発行機能は **turnstileApiToken プラグイン** として独立しています。
>
> 詳細: [`plugins/turnstileApiToken/README.md`](../../plugins/turnstileApiToken/README.md)

## 移行について

| 項目 | 旧 (hono-bbs 本体) | 新 (turnstileApiToken プラグイン) |
|---|---|---|
| エンドポイントパス | `{API_BASE_PATH}/auth/turnstile` | `TURNSTILE_PATH` 環境変数で設定 (デフォルト: `/auth/turnstile`) |
| セッション発行 | hono-bbs Worker が KV に書き込む | turnstileApiToken Worker が KV に書き込む |
| hono-bbs 側の検証 | `DISABLE_TURNSTILE=true` でスキップ | `ENABLE_TURNSTILE=true` のとき KV を検証する |
| SESSION_KV | hono-bbs の binding として設定 | 両 Worker で同じ KV ネームスペースを共有 |

## hono-bbs 側の設定変更

- `DISABLE_TURNSTILE` → `ENABLE_TURNSTILE` に変数名変更 (論理が逆転)
  - 旧: `DISABLE_TURNSTILE=true` → スキップ
  - 新: `ENABLE_TURNSTILE` 未設定 or `false` → スキップ (デフォルト)
  - 新: `ENABLE_TURNSTILE=true` → SESSION_KV で検証
- `TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY`, `TURNSTILE_TOKEN_TTL`, `ALLOW_BBS_UI_DOMAINS` は hono-bbs の環境変数から**削除**。turnstileApiToken プラグイン側に設定する。
