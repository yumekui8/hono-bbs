import { Hono } from 'hono'
import { trimTrailingSlash } from 'hono/trailing-slash'
import type { PluginEnv } from './types'
import { turnstilePageHandler, turnstileVerifyHandler } from './handler'
import { setupAdapters } from './adapters'

// ドメイン制限ミドルウェア (BBS_ALLOW_DOMAIN が設定されている場合のみ有効)
function domainRestrict(allowDomain: string | undefined, host: string): boolean {
  if (!allowDomain) return true
  const allowed = allowDomain.split(',').map(d => d.trim()).filter(Boolean)
  if (allowed.length === 0) return true
  return allowed.some(d => host === d || host.endsWith(`.${d}`))
}

// リクエストの Origin が許可リストに含まれるか確認し、CORS ヘッダーを返す
function buildCorsHeaders(request: Request, corsOrigin: string | undefined): HeadersInit {
  const allowed = (corsOrigin ?? '').split(',').map(s => s.trim()).filter(Boolean)
  const requestOrigin = request.headers.get('Origin') ?? ''
  const allowOrigin = allowed.length === 0 ? '*' : (allowed.includes(requestOrigin) ? requestOrigin : '')
  if (!allowOrigin) return {}
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
  }
}

export default {
  async fetch(request: Request, env: PluginEnv['Bindings'], ctx: ExecutionContext): Promise<Response> {
    const corsHeaders = buildCorsHeaders(request, env.CORS_ORIGIN)

    // OPTIONS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders })
    }

    // ドメイン制限チェック
    const host = new URL(request.url).hostname
    if (!domainRestrict(env.BBS_ALLOW_DOMAIN, host)) {
      return Response.json(
        { error: 'FORBIDDEN', message: 'This domain is not allowed' },
        { status: 403, headers: corsHeaders },
      )
    }

    // TURNSTILE_PATH で指定されたパスにマウント (デフォルト: /auth/turnstile)
    // パスが一致しない場合は 404 を返す
    const mountPath = (env.TURNSTILE_PATH ?? '/auth/turnstile').replace(/\/$/, '')
    const url = new URL(request.url)
    const pathWithoutTrailingSlash = url.pathname.replace(/\/$/, '') || '/'

    if (pathWithoutTrailingSlash !== mountPath) {
      return Response.json(
        { error: 'NOT_FOUND', message: `Turnstile endpoint is at ${mountPath}` },
        { status: 404, headers: corsHeaders },
      )
    }

    const app = new Hono<PluginEnv>()
    app.use(trimTrailingSlash())
    app.use('*', setupAdapters)
    app.get(mountPath, turnstilePageHandler)
    app.post(mountPath, turnstileVerifyHandler)
    app.onError((err, c) => {
      console.error(err)
      return c.json({ error: 'INTERNAL_SERVER_ERROR', message: 'An error occurred' }, 500)
    })

    const response = await app.fetch(request, env, ctx)
    const newHeaders = new Headers(response.headers)
    for (const [key, value] of Object.entries(corsHeaders)) {
      newHeaders.set(key, value)
    }
    return new Response(response.body, { status: response.status, headers: newHeaders })
  },
}
