export type Env = {
  Bindings: {
    BBS_DB: D1Database
    // 管理者ロール ID (未設定時は 'admin-role')
    ADMIN_ROLE?: string
    // API ベースパス (例: /api/datimport、未設定時は '')
    BASE_PATH?: string
    // 許可 CORS オリジン (カンマ区切り、未設定時は *)
    CORS_ORIGIN?: string
  }
}

export type DatPost = {
  posterName: string
  posterOptionInfo: string  // メール欄
  dateStr: string           // ISO 8601 形式 (UTC 変換済み)
  authorId: string          // ID:xxx の xxx 部分
  content: string           // 本文 (<br> をそのまま保持)
  threadTitle: string       // 1 行目のみ有効、それ以外は空文字
}
