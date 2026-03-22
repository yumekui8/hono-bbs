export type ImageStatus = 'pending' | 'active' | 'reported' | 'deleted'

export type Image = {
  id: string
  storageKey: string
  originalFilename: string | null
  contentType: string
  size: number | null
  status: ImageStatus
  turnstileSessionId: string | null
  reportCount: number
  createdAt: string
  confirmedAt: string | null
  expiresAt: string | null
}

export type PluginEnv = {
  Bindings: {
    IMAGE_DB: D1Database
    IMAGE_KV: KVNamespace | undefined  // レート制限用 KV (未設定時はレート制限無効)
    // Turnstile 連携 (ENABLE_TURNSTILE=true のとき SESSION_KV も設定が必要)
    SESSION_KV: KVNamespace | undefined
    ENABLE_TURNSTILE: string | undefined    // 'true' で X-Turnstile-Session を KV 検証
    // レート制限
    UPLOAD_RATE_LIMIT: string | undefined   // 単位時間内の最大アップロード数 (0=無制限)
    UPLOAD_RATE_WINDOW: string | undefined  // 単位時間 (分, デフォルト: 60)
    // S3 互換ストレージ設定
    S3_ENDPOINT: string                     // e.g. "https://xxx.r2.cloudflarestorage.com"
    S3_BUCKET: string
    S3_REGION: string                       // R2 は "auto", AWS S3 は "ap-northeast-1" 等
    S3_ACCESS_KEY_ID: string
    S3_SECRET_ACCESS_KEY: string
    // 公開 URL (CDN または R2 パブリック URL のベース)
    IMAGE_PUBLIC_BASE_URL: string
    // アップロード設定
    PRESIGNED_URL_TTL: string | undefined   // Presigned URL 有効期限 (秒, デフォルト: 300)
    MAX_IMAGE_SIZE: string | undefined      // 最大ファイルサイズ (バイト, 0=無制限)
    ALLOWED_CONTENT_TYPES: string | undefined  // 許可 MIME タイプ (カンマ区切り)
    // 自動削除
    IMAGE_TTL_DAYS: string | undefined      // 画像保持日数 (0=無期限)
    // 管理者認証
    ADMIN_API_KEY: string | undefined
    // CORS
    CORS_ORIGIN: string | undefined
  }
  Variables: {
    turnstileSessionId: string | null   // Turnstile セッション ID (未使用時は null)
  }
}
