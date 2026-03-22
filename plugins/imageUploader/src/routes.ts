import type { Hono, MiddlewareHandler } from 'hono'
import type { PluginEnv } from './types'
import * as handler from './handler'

// Turnstile セッション検証ミドルウェア
// ENABLE_TURNSTILE=true のときのみ KV 検証を行う
const requireTurnstile: MiddlewareHandler<PluginEnv> = async (c, next) => {
  if (c.env.ENABLE_TURNSTILE !== 'true') {
    c.set('turnstileSessionId', null)
    await next()
    return
  }

  const sessionId = c.req.header('X-Turnstile-Session')
  if (!sessionId) {
    return c.json({ error: 'TURNSTILE_REQUIRED', message: 'X-Turnstile-Session header required' }, 400)
  }

  const kv = c.env.SESSION_KV
  if (!kv) {
    return c.json({ error: 'CONFIG_ERROR', message: 'SESSION_KV is required when ENABLE_TURNSTILE=true' }, 500)
  }

  // hono-bbs の sessionRepository と同じ "turnstile:<id>" キーを参照する
  const data = await kv.get<{ expiresAt: string }>(`turnstile:${sessionId}`, 'json')
  if (!data || new Date(data.expiresAt) < new Date()) {
    return c.json({ error: 'TURNSTILE_INVALID', message: 'Invalid or expired Turnstile session' }, 400)
  }

  c.set('turnstileSessionId', sessionId)
  await next()
}

// 管理者認証ミドルウェア (Bearer トークン)
const requireAdmin: MiddlewareHandler<PluginEnv> = async (c, next) => {
  const apiKey = c.env.ADMIN_API_KEY
  if (!apiKey) {
    return c.json({ error: 'FORBIDDEN', message: 'Admin access is not configured' }, 403)
  }
  const auth = c.req.header('Authorization')
  if (!auth?.startsWith('Bearer ') || auth.slice(7) !== apiKey) {
    return c.json({ error: 'UNAUTHORIZED', message: 'Invalid admin API key' }, 401)
  }
  await next()
}

export function setupRoutes(app: Hono<PluginEnv>): void {
  app.post('/upload/request', requireTurnstile, handler.requestUploadHandler)
  app.post('/upload/confirm/:imageId', handler.confirmUploadHandler)
  app.get('/images/:imageId', handler.getImageHandler)
  app.post('/images/:imageId/report', handler.reportImageHandler)
  // 投稿者自身による削除: deleteToken を URL に含める (:deleteToken より先に定義)
  app.delete('/images/:imageId/:deleteToken', handler.userDeleteImageHandler)
  // 管理者削除: Authorization: Bearer <ADMIN_API_KEY>
  app.delete('/images/:imageId', requireAdmin, handler.deleteImageHandler)
}
