export type TurnstileSession = {
  id: string
  createdAt: string
  expiresAt: string
}

export type PluginEnv = {
  Bindings: {
    // hono-bbs 本体と同じ KV ネームスペースを共有すること
    SESSION_KV: KVNamespace
    TURNSTILE_SITE_KEY: string | undefined
    TURNSTILE_SECRET_KEY: string | undefined
    DISABLE_TURNSTILE: string | undefined           // 'true' でスキップ (ローカル開発用)
    TURNSTILE_TOKEN_TTL: string | undefined         // 有効期限 (分単位, 0=無期限, デフォルト: 525600=1年)
    TURNSTILE_PATH: string | undefined              // このWorkerがマウントされるパス (デフォルト: /auth/turnstile)
    ALLOW_BBS_UI_DOMAINS: string | undefined        // Turnstile認証後のリダイレクト許可UIドメイン (カンマ区切り)
    BBS_ALLOW_DOMAIN: string | undefined            // 許可ドメイン (カンマ区切り、未設定時は制限なし)
    CORS_ORIGIN: string | undefined                 // 許可するオリジン (カンマ区切り、未設定時は *)
  }
}
