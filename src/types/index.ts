export type Board = {
  id: string
  name: string
  description: string | null
  createdAt: string
}

export type Thread = {
  id: string
  boardId: string
  title: string
  createdAt: string
}

export type Post = {
  id: string
  threadId: string
  content: string
  createdAt: string
}

export type AppEnv = {
  Bindings: {
    DB: D1Database
    // 管理者操作用APIキー（板・スレッド・投稿の削除、板の作成）
    ADMIN_API_KEY: string
    // reCAPTCHA検証用シークレットキー
    RECAPTCHA_SECRET_KEY: string
    // 'true' を設定するとreCAPTCHAをスキップ（開発環境用）
    DISABLE_RECAPTCHA: string
  }
}
