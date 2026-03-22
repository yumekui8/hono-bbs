import { Hono } from 'hono'
import { trimTrailingSlash } from 'hono/trailing-slash'
import type { Env } from './types'
import { datImportHandler } from './handler'

const app = new Hono<Env>()
app.use(trimTrailingSlash())

// 管理者向け dat インポートエンドポイント
// POST /<BASE_PATH>/admin/datimport?board=<boardId>
app.post('/admin/datimport', datImportHandler)

app.onError((err, c) => {
  console.error('[datImport error]', err)
  // 管理者専用エンドポイントのため実際のエラーメッセージを返す
  return c.json({ error: 'INTERNAL_SERVER_ERROR', message: err.message ?? 'An error occurred' }, 500)
})

function buildCorsHeaders(request: Request, corsOrigin: string | undefined): HeadersInit {
  const allowed = (corsOrigin ?? '').split(',').map(s => s.trim()).filter(Boolean)
  const requestOrigin = request.headers.get('Origin') ?? ''
  const allowOrigin = allowed.length === 0 ? '*' : (allowed.includes(requestOrigin) ? requestOrigin : '')
  if (!allowOrigin) return {}
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
  }
}

export default {
  async fetch(request: Request, env: Env['Bindings'], ctx: ExecutionContext): Promise<Response> {
    const corsHeaders = buildCorsHeaders(request, env.CORS_ORIGIN)

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders })
    }

    // BASE_PATH プレフィックスを除去してからルーティングする
    const basePath = (env.BASE_PATH ?? '').replace(/\/$/, '')
    let url = new URL(request.url)
    if (basePath && url.pathname.startsWith(basePath)) {
      url = new URL(request.url)
      const newPath = url.pathname.slice(basePath.length) || '/'
      const rewritten = new Request(
        new URL(newPath + url.search, url.origin).toString(),
        request,
      )
      const response = await app.fetch(rewritten, env, ctx)
      const newHeaders = new Headers(response.headers)
      for (const [key, value] of Object.entries(corsHeaders)) {
        newHeaders.set(key, value)
      }
      return new Response(response.body, { status: response.status, headers: newHeaders })
    }

    const response = await app.fetch(request, env, ctx)
    const newHeaders = new Headers(response.headers)
    for (const [key, value] of Object.entries(corsHeaders)) {
      newHeaders.set(key, value)
    }
    return new Response(response.body, { status: response.status, headers: newHeaders })
  },
}
