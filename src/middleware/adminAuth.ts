import type { MiddlewareHandler } from 'hono'
import type { AppEnv } from '../types'

// X-API-Key ヘッダーで管理者認証を行うミドルウェア
export const adminAuth: MiddlewareHandler<AppEnv> = async (c, next) => {
  const apiKey = c.req.header('X-API-Key')
  if (!apiKey || apiKey !== c.env.ADMIN_API_KEY) {
    return c.json({ error: 'UNAUTHORIZED', message: 'Invalid or missing API key' }, 401)
  }
  await next()
}
