// IDの表示フォーマット
export type IdFormat =
  | 'daily_hash'           // 全員: userToken+日付の日毎ハッシュ (先頭10文字)
  | 'daily_hash_or_user'   // 匿名: 日毎ハッシュ / ログイン済み: ユーザID
  | 'api_key_hash'         // 全員: userTokenのハッシュ (先頭10文字)
  | 'api_key_hash_or_user' // 匿名: APIキーハッシュ / ログイン済み: ユーザID
  | 'none'                 // 表示なし

export type User = {
  id: string              // ログインID兼表示ID (変更不可)
  displayName: string
  bio: string | null
  email: string | null
  isActive: boolean
  primaryRoleId: string | null
  createdAt: string
  updatedAt: string
}

export type Role = {
  id: string
  name: string
  createdAt: string
}

export type Session = {
  id: string
  userId: string
  isActive: boolean
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
  administrators: string        // カンマ区切りのユーザID/ロールID
  members: string
  permissions: string           // "admins,members,users,anon" 各値は操作ビットマスク (0-31)
  name: string
  description: string
  maxThreads: number            // 0=無制限
  maxThreadTitleLength: number  // 0=無制限
  defaultMaxPosts: number       // 0=無制限
  defaultMaxPostLength: number  // 0=無制限
  defaultMaxPostLines: number   // 0=無制限
  defaultMaxPosterNameLength: number    // 0=無制限
  defaultMaxPosterOptionLength: number  // 0=無制限
  defaultPosterName: string
  defaultIdFormat: IdFormat
  defaultThreadAdministrators: string   // テンプレート展開済み (作成時に $CREATOR 等を解決)
  defaultThreadMembers: string
  defaultThreadPermissions: string
  defaultPostAdministrators: string
  defaultPostMembers: string
  defaultPostPermissions: string
  category: string
  createdAt: string
  adminMeta: AdminMeta
}

export type Thread = {
  id: string
  boardId: string
  administrators: string
  members: string
  permissions: string
  title: string
  maxPosts: number              // 0=ボードのデフォルトを継承
  maxPostLength: number         // 0=ボードのデフォルトを継承
  maxPostLines: number          // 0=ボードのデフォルトを継承
  maxPosterNameLength: number   // 0=ボードのデフォルトを継承
  maxPosterOptionLength: number // 0=ボードのデフォルトを継承
  posterName: string            // ''=ボードのデフォルトを継承
  idFormat: string              // ''=ボードのデフォルトを継承
  postCount: number
  isEdited: boolean
  editedAt: string | null
  createdAt: string
  updatedAt: string
  adminMeta: AdminMeta
  firstPost?: Post | null       // スレッド一覧取得時のみ含まれる
}

export type Post = {
  id: string
  threadId: string
  postNumber: number
  administrators: string
  members: string
  permissions: string
  authorId: string              // idFormat に従って計算された表示ID
  posterName: string
  posterOptionInfo: string
  content: string
  isDeleted: boolean
  isEdited: boolean
  editedAt: string | null
  createdAt: string
  adminMeta: AdminMeta
}

import type { DbAdapter } from '../adapters/db'
import type { KvAdapter } from '../adapters/kv'

export type { DbAdapter, KvAdapter }

export type AppEnv = {
  Bindings: {
    // ── Cloudflare Workers ネイティブバインディング ──────────────
    DB?: D1Database
    SESSION_KV?: KVNamespace
    // ── 認証・セキュリティ ────────────────────────────────────────
    ENABLE_TURNSTILE?: string
    ADMIN_INITIAL_PASSWORD?: string
    ADMIN_USERNAME?: string
    USER_ADMIN_ROLE?: string       // ユーザ管理ロールID (デフォルト: user-admin-role)
    // ── API 設定 ─────────────────────────────────────────────────
    MAX_REQUEST_SIZE?: string
    API_BASE_PATH: string
    CORS_ORIGIN?: string
    BBS_ALLOW_DOMAIN?: string
    USER_DISPLAY_LIMIT?: string
    ROLE_DISPLAY_LIMIT?: string    // ロール一覧ページネーション件数 (0=無制限)
    KV_PREFIX?: string
  }
  Variables: {
    db: DbAdapter
    kv: KvAdapter
    userId: string | null
    isSysAdmin: boolean          // admin-role メンバー (全権限バイパス)
    isUserAdmin: boolean         // user-admin-role メンバー (ユーザ管理 + adminMeta 参照)
    userRoleIds: string[]        // ユーザが持つロールID一覧
    primaryRoleId: string | null
  }
}
