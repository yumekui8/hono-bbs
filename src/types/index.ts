// IDの表示フォーマット
export type IdFormat =
  | 'daily_hash'           // 全員: userToken+日付の日毎ハッシュ (先頭10文字)
  | 'daily_hash_or_user'   // 匿名: 日毎ハッシュ / ログイン済み: ユーザID
  | 'api_key_hash'         // 全員: userTokenのハッシュ (先頭10文字)
  | 'api_key_hash_or_user' // 匿名: APIキーハッシュ / ログイン済み: ユーザID
  | 'none'                 // 表示なし

export type User = {
  id: string
  username: string
  primaryGroupId: string | null
  createdAt: string
}

export type Group = {
  id: string
  name: string
  createdAt: string
}

export type Session = {
  id: string
  userId: string
  createdAt: string
  expiresAt: string
}

export type TurnstileSession = {
  id: string
  createdAt: string
  expiresAt: string
}

// 管理者のみ参照可能な作成者情報
export type AdminMeta = {
  creatorUserId: string | null
  creatorSessionId: string | null
  creatorTurnstileSessionId: string | null
}

export type Board = {
  id: string
  ownerUserId: string | null
  ownerGroupId: string | null
  permissions: string           // "15,12,8"
  name: string
  description: string | null
  maxThreads: number
  maxThreadTitleLength: number
  defaultMaxPosts: number
  defaultMaxPostLength: number
  defaultMaxPostLines: number
  defaultMaxPosterNameLength: number
  defaultMaxPosterSubInfoLength: number
  defaultMaxPosterMetaInfoLength: number
  defaultPosterName: string
  defaultIdFormat: IdFormat
  defaultThreadOwnerUserId: string | null
  defaultThreadOwnerGroupId: string | null
  defaultThreadPermissions: string
  createdAt: string
  adminMeta: AdminMeta
}

export type Thread = {
  id: string
  boardId: string
  ownerUserId: string | null
  ownerGroupId: string | null
  permissions: string
  title: string
  // NULLは板の設定を継承
  maxPosts: number | null
  maxPostLength: number | null
  maxPostLines: number | null
  maxPosterNameLength: number | null
  maxPosterSubInfoLength: number | null
  maxPosterMetaInfoLength: number | null
  posterName: string | null
  idFormat: IdFormat | null
  postCount: number
  createdAt: string
  updatedAt: string
  adminMeta: AdminMeta
}

export type Post = {
  id: string
  threadId: string
  postNumber: number
  userId: string | null
  displayUserId: string
  posterName: string
  posterSubInfo: string | null
  content: string
  createdAt: string
  adminMeta: AdminMeta
}

export type AppEnv = {
  Bindings: {
    DB: D1Database
    SESSION_KV: KVNamespace       // ログインセッション・Turnstileセッション保存先
    TURNSTILE_SITE_KEY: string | undefined
    TURNSTILE_SECRET_KEY: string | undefined
    DISABLE_TURNSTILE: string | undefined   // 'true' でスキップ (ローカル開発用)
    ADMIN_INITIAL_PASSWORD: string | undefined  // POST /auth/setup で使用
    API_BASE_PATH: string      // e.g. "/api/v1"
  }
  Variables: {
    userId: string | null           // セッションから取得したユーザID
    isAdmin: boolean                // sys-user-admin-group メンバーかどうか
    userGroupIds: string[]          // ユーザが所属するグループID一覧
    userToken: string | null        // 匿名ユーザのトークン (X-User-Token)
    primaryGroupId: string | null   // ユーザのプライマリグループID
  }
}
