import type { MiddlewareHandler } from 'hono'
import type { AppEnv } from '../types'

// BBS_ALLOW_DOMAIN が設定されている場合、リクエストの Host ヘッダーを確認してドメイン制限を行う
// 未設定時は制限なし (全ドメインを許可)
export const domainRestrict: MiddlewareHandler<AppEnv> = async (c, next) => {
  const allowDomain = c.env.BBS_ALLOW_DOMAIN
  if (!allowDomain) {
    await next()
    return
  }

  const allowed = allowDomain.split(',').map(s => s.trim()).filter(Boolean)
  if (allowed.length === 0) {
    await next()
    return
  }

  const host = c.req.header('Host') ?? ''
  // ポート番号を含む場合もそのまま比較する (e.g. "localhost:8787")
  if (!allowed.includes(host)) {
    return c.json({ error: 'FORBIDDEN', message: 'Access denied: domain not allowed' }, 403)
  }

  await next()
}
