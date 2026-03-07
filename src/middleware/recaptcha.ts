import type { MiddlewareHandler } from 'hono'
import type { AppEnv } from '../types'

// X-Recaptcha-Token ヘッダーでreCAPTCHA検証を行うミドルウェア
export const recaptcha: MiddlewareHandler<AppEnv> = async (c, next) => {
  // 開発環境ではスキップ可能（.dev.vars に DISABLE_RECAPTCHA=true を設定）
  if (c.env.DISABLE_RECAPTCHA === 'true') {
    await next()
    return
  }

  const token = c.req.header('X-Recaptcha-Token')
  if (!token) {
    return c.json({ error: 'RECAPTCHA_REQUIRED', message: 'reCAPTCHA token is required' }, 400)
  }

  const verified = await verifyRecaptcha(token, c.env.RECAPTCHA_SECRET_KEY)
  if (!verified) {
    return c.json({ error: 'RECAPTCHA_FAILED', message: 'reCAPTCHA verification failed' }, 400)
  }

  await next()
}

async function verifyRecaptcha(token: string, secretKey: string): Promise<boolean> {
  const params = new URLSearchParams({ secret: secretKey, response: token })
  const response = await fetch('https://www.google.com/recaptcha/api/siteverify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  })
  const data = await response.json<{ success: boolean }>()
  return data.success
}
