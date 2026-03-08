import type { MiddlewareHandler } from 'hono'
import type { AppEnv } from '../types'
import * as sessionRepository from '../repository/sessionRepository'

// X-Turnstile-Session ヘッダーで Turnstile セッションを検証するミドルウェア
export const requireTurnstile: MiddlewareHandler<AppEnv> = async (c, next) => {
  // 開発環境ではスキップ可能 (.dev.vars に DISABLE_TURNSTILE=true を設定)
  if (c.env.DISABLE_TURNSTILE === 'true') {
    await next()
    return
  }

  const sessionId = c.req.header('X-Turnstile-Session')
  if (!sessionId) {
    return c.json({ error: 'TURNSTILE_REQUIRED', message: 'X-Turnstile-Session header required' }, 400)
  }

  const session = await sessionRepository.findTurnstileSessionById(c.env.SESSION_KV, sessionId)
  if (!session) {
    return c.json({ error: 'TURNSTILE_INVALID', message: 'Invalid or expired Turnstile session' }, 400)
  }

  await next()
}
