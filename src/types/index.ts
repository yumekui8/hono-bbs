// IDの表示フォーマット
export type IdFormat =
  | 'daily_hash'           // 全員: userToken+日付の日毎ハッシュ (先頭10文字)
  | 'daily_hash_or_user'   // 匿名: 日毎ハッシュ / ログイン済み: ユーザID
  | 'api_key_hash'         // 全員: userTokenのハッシュ (先頭10文字)
  | 'api_key_hash_or_user' // 匿名: APIキーハッシュ / ログイン済み: ユーザID
  | 'none'                 // 表示なし

export type User = {
  id: string              // ログインID兼表示ID (変更不可)
  displayName: string     // 表示名 (日本語可)
  bio: string | null      // 自己紹介
  email: string | null    // メールアドレス
  isActive: boolean       // アカウント有効フラグ (管理者のみ変更可)
  primaryGroupId: string | null
  createdAt: string
  updatedAt: string
}

export type Group = {
  id: string
  name: string
  createdAt: string
}

export type Session = {
  id: string
  userId: string
  isActive: boolean       // セッション有効フラグ (false で無効化済み)
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
  permissions: string           // "owner,group,auth,anon" 各値は操作ビットマスク
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
  category: string | null              // カテゴリ / タグ (省略可)
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
  ownerUserId: string | null    // 投稿者ユーザID (匿名の場合 NULL)
  ownerGroupId: string | null   // スレッドの ownerGroupId を継承
  permissions: string           // "owner,group,auth,anon" 各値は操作ビットマスク
  userId: string | null         // ログイン中ユーザID (adminMeta 用)
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
    ADMIN_USERNAME: string | undefined      // 管理者ユーザID (デフォルト: admin)
    USER_ADMIN_GROUP: string | undefined    // ユーザ管理グループID (デフォルト: user-admin-group)
    BBS_ADMIN_GROUP: string | undefined     // 掲示板管理グループID (デフォルト: bbs-admin-group)
    ENDPOINT_PERMISSIONS: string | undefined // エンドポイント権限JSON (省略時はデフォルト値を使用)
    MAX_REQUEST_SIZE: string | undefined    // リクエストサイズ上限 例: "1mb", "500kb"
    TURNSTILE_TOKEN_TTL: string | undefined // Turnstile セッション有効期限 (分単位, 0=無期限, デフォルト: 525600=1年)
    API_BASE_PATH: string      // e.g. "/api/v1"
    CORS_ORIGIN: string | undefined  // 許可するオリジン カンマ区切り
    BBS_ALLOW_DOMAIN: string | undefined      // 許可するドメイン カンマ区切り (未設定時は制限なし)
    ALLOW_BBS_UI_DOMAINS: string | undefined  // Turnstile認証後のリダイレクト許可UIドメイン
    USER_DISPLAY_LIMIT: string | undefined  // ユーザ一覧ページネーション件数 (0=無制限)
    GROUP_DISPLAY_LIMIT: string | undefined // グループ一覧ページネーション件数 (0=無制限)
  }
  Variables: {
    userId: string | null           // セッションから取得したユーザID
    isAdmin: boolean                // bbsAdminGroup メンバーかどうか
    isUserAdmin: boolean            // userAdminGroup メンバーかどうか
    userGroupIds: string[]          // ユーザが所属するグループID一覧
    primaryGroupId: string | null   // ユーザのプライマリグループID
  }
}
