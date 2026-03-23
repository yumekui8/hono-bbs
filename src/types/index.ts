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
  // スレッド一覧取得時のみ含まれる (postNumber=1 の第1レス)
  firstPost?: Post | null
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
  isDeleted: boolean            // ソフト削除フラグ
  createdAt: string
  adminMeta: AdminMeta
}

import type { DbAdapter } from '../adapters/db'
import type { KvAdapter } from '../adapters/kv'

export type { DbAdapter, KvAdapter }

export type AppEnv = {
  Bindings: {
    // ── Cloudflare Workers ネイティブバインディング ──────────────
    // Node.js 環境では不要 (src/index.node.ts でアダプターを直接生成する)
    DB?: D1Database                // Cloudflare D1 (Workers のみ)
    SESSION_KV?: KVNamespace       // Cloudflare KV (Workers のみ)
    // ── 認証・セキュリティ ────────────────────────────────────────
    ENABLE_TURNSTILE?: string      // 'true' のとき KV で Turnstile セッションを検証する
    ADMIN_INITIAL_PASSWORD?: string // POST /auth/setup で使用
    ADMIN_USERNAME?: string        // 管理者ユーザID (デフォルト: admin)
    USER_ADMIN_GROUP?: string      // ユーザ管理グループID (デフォルト: user-admin-group)
    BBS_ADMIN_GROUP?: string       // 掲示板管理グループID (デフォルト: bbs-admin-group)
    // ── API 設定 ─────────────────────────────────────────────────
    ENDPOINT_PERMISSIONS?: string  // エンドポイント権限JSON (省略時はデフォルト値を使用)
    MAX_REQUEST_SIZE?: string      // リクエストサイズ上限 例: "1mb", "500kb"
    API_BASE_PATH: string          // e.g. "/api/v1"
    CORS_ORIGIN?: string           // 許可するオリジン カンマ区切り
    BBS_ALLOW_DOMAIN?: string      // 許可するドメイン カンマ区切り (未設定時は制限なし)
    USER_DISPLAY_LIMIT?: string    // ユーザ一覧ページネーション件数 (0=無制限)
    GROUP_DISPLAY_LIMIT?: string   // グループ一覧ページネーション件数 (0=無制限)
    // ── KV プレフィックス ─────────────────────────────────────────
    // 複数インスタンスで同一 KV ネームスペース / Redis を共有する際のキー衝突防止
    // 例: "prod:" → "prod:session:{id}", "prod:turnstile:{id}" のように付与される
    KV_PREFIX?: string
  }
  Variables: {
    // セットアップミドルウェア (src/middleware/adapters.ts) が設定するアダプター
    db: DbAdapter                  // DB アダプター (D1 / MySQL / PostgreSQL / SQLite)
    kv: KvAdapter                  // KV アダプター (Cloudflare KV / Redis / Memory)
    // 認証コンテキスト (src/middleware/auth.ts が設定)
    userId: string | null          // セッションから取得したユーザID
    isAdmin: boolean               // bbsAdminGroup メンバーかどうか
    isUserAdmin: boolean           // userAdminGroup メンバーかどうか
    userGroupIds: string[]         // ユーザが所属するグループID一覧
    primaryGroupId: string | null  // ユーザのプライマリグループID
  }
}
