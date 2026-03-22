export type Env = {
  Bindings: {
    BBS_DB: D1Database
    // 管理者グループ ID (未設定時は 'bbs-admin-group')
    BBS_ADMIN_GROUP?: string
    // API ベースパス (例: /api/datimport、未設定時は '')
    BASE_PATH?: string
    // 許可 CORS オリジン (カンマ区切り、未設定時は *)
    CORS_ORIGIN?: string
  }
}

export type DatPost = {
  posterName: string
  posterSubInfo: string  // メール欄
  dateStr: string        // ISO 8601 形式 (UTC 変換済み)
  displayUserId: string  // ID:xxx の xxx 部分
  content: string        // 本文 (<br> をそのまま保持)
  threadTitle: string    // 1 行目のみ有効、それ以外は空文字
}
