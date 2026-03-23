import type { DbAdapter } from './adapters/db'
import type { KvAdapter } from './adapters/kv'

export type Env = {
  Bindings: {
    BBS_DB: D1Database     // Cloudflare D1 (Workers のみ)
    // Turnstile セッション保存先 KV (edge-token の状態管理に使用)
    // hono-bbs 本体と同じ KV ネームスペースを使っても問題ない (プレフィックスで区別する)
    SESSION_KV: KVNamespace  // Cloudflare KV (Workers のみ)
    // このWorkerのベースURL (bbsmenu.html / 認証ページのリンク生成に使用)
    // 例: "https://2ch.example.com"
    SITE_URL?: string
    // 掲示板サイト名 (bbsmenu.htmlのタイトルに表示)
    BBS_NAME?: string
    // 許可する CORS オリジン (カンマ区切り、未設定時は *)
    CORS_ORIGIN?: string
    // 'true' のとき書き込み時に Turnstile 認証を必須とする
    ENABLE_TURNSTILE?: string
    // Turnstile サイトキー (公開値)
    TURNSTILE_SITE_KEY?: string
    // Turnstile シークレットキー (wrangler secret put TURNSTILE_SECRET_KEY)
    TURNSTILE_SECRET_KEY?: string
    // スレッド作成時の owner_user_id / owner_group_id (未設定時は NULL)
    THREAD_OWNER_USER?: string
    THREAD_OWNER_GROUP?: string
    // 投稿作成時の owner_user_id / owner_group_id (未設定時は NULL)
    POST_OWNER_USER?: string
    POST_OWNER_GROUP?: string
    // KV グローバルプレフィックス (複数インスタンス共存時のキー衝突防止)
    KV_PREFIX?: string
  }
  Variables: {
    // setupAdapters ミドルウェアが設定するアダプター
    db: DbAdapter    // D1 アダプター
    kv: KvAdapter    // KV アダプター (edge-token 管理用)
  }
}

export type BoardRow = {
  id: string
  name: string
  description: string | null
  category: string | null
  default_poster_name: string
  default_thread_permissions: string
  // SETTING.TXT 用フィールド
  max_thread_title_length: number
  default_max_post_lines: number
  default_max_poster_name_length: number
  default_max_poster_sub_info_length: number
  default_max_post_length: number
}

export type ThreadRow = {
  id: string
  title: string
  post_count: number
  created_at: string
  updated_at: string
  unix_ts: number
}

export type PostRow = {
  post_number: number
  poster_name: string
  poster_sub_info: string | null
  display_user_id: string
  content: string
  created_at: string
  is_deleted: number  // 1=削除済み
}
