import type { MiddlewareHandler } from 'hono'
import type { AppEnv } from '../types'
import * as sessionRepository from '../repository/sessionRepository'

// X-Turnstile-Session ヘッダーで Turnstile セッションを検証するミドルウェア
// ENABLE_TURNSTILE=true のときのみ KV 検証を行う。未設定または false のときはスキップ。
export const requireTurnstile: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (c.env.ENABLE_TURNSTILE !== 'true') {
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
