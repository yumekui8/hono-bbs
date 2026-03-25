import { Hono } from 'hono'
import { trimTrailingSlash } from 'hono/trailing-slash'
import type { AppEnv } from './types'
import { authContext } from './middleware/auth'
import { setupAdapters } from './middleware/adapters'
import { domainRestrict } from './middleware/domain'
import { requestSizeLimit } from './middleware/requestSize'
import auth from './routes/auth'
import identity from './routes/identity'
import profile from './routes/profile'
import boards from './routes/boards'

// 内部ルーター (ベースパスなし)
const api = new Hono<AppEnv>()

// 末尾スラッシュを除去 (GET /boards/ → GET /boards と同等に扱う)
api.use(trimTrailingSlash())
// ドメイン制限 (BBS_ALLOW_DOMAIN が設定されている場合のみ有効)
api.use('*', domainRestrict)
// リクエストサイズ制限 (MAX_REQUEST_SIZE が設定されている場合のみ有効)
api.use('*', requestSizeLimit)
// アダプターセットアップ (DB / KV をコンテキストにセット)
api.use('*', setupAdapters)
// 全ルートに認証コンテキストを適用
api.use('*', authContext)

api.route('/auth', auth)
api.route('/identity', identity)
api.route('/profile', profile)
api.route('/boards', boards)

// グローバルエラーハンドラー
api.onError((err, c) => {
  console.error(err)
  return c.json({ error: 'INTERNAL_SERVER_ERROR', message: 'An error occurred' }, 500)
})

// リクエストの Origin が許可リストに含まれるか確認し、CORS ヘッダーを返す
// CORS_ORIGIN 未設定時は * (全許可) にフォールバック
function buildCorsHeaders(request: Request, corsOrigin: string | undefined): HeadersInit {
  const allowed = (corsOrigin ?? '').split(',').map(s => s.trim()).filter(Boolean)
  const requestOrigin = request.headers.get('Origin') ?? ''
  const allowOrigin = allowed.length === 0 ? '*' : (allowed.includes(requestOrigin) ? requestOrigin : '')
  if (!allowOrigin) return {}
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Session-Id, X-Turnstile-Session',
    'Access-Control-Max-Age': '86400',
  }
}

// API_BASE_PATH を env から動的に読み取り、URLのプレフィックスを除去して内部ルーターに転送
export default {
  async fetch(request: Request, env: AppEnv['Bindings'], ctx: ExecutionContext): Promise<Response> {
    const basePath = env.API_BASE_PATH ?? '/api/v1'
    const url = new URL(request.url)
    const corsHeaders = buildCorsHeaders(request, env.CORS_ORIGIN)

    // OPTIONS preflight は常にここで処理
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders })
    }

    if (!url.pathname.startsWith(basePath)) {
      return Response.json(
        { error: 'NOT_FOUND', message: `API base path is ${basePath}` },
        { status: 404, headers: corsHeaders },
      )
    }

    // ベースパスを除去して内部ルーターに転送し、レスポンスに CORS ヘッダーを付与
    const newPath = url.pathname.slice(basePath.length) || '/'
    url.pathname = newPath
    const response = await api.fetch(new Request(url.toString(), request), env, ctx)

    const newHeaders = new Headers(response.headers)
    for (const [key, value] of Object.entries(corsHeaders)) {
      newHeaders.set(key, value)
    }
    return new Response(response.body, { status: response.status, headers: newHeaders })
  },
}
