import { Hono } from 'hono'
import { trimTrailingSlash } from 'hono/trailing-slash'
import type { PluginEnv } from './types'
import { setupRoutes } from './routes'
import { runCleanup } from './cleanup'

const app = new Hono<PluginEnv>()
app.use(trimTrailingSlash())
setupRoutes(app)
app.onError((err, c) => {
  console.error(err)
  return c.json({ error: 'INTERNAL_SERVER_ERROR', message: 'An error occurred' }, 500)
})

function buildCorsHeaders(request: Request, corsOrigin: string | undefined): HeadersInit {
  const allowed = (corsOrigin ?? '').split(',').map(s => s.trim()).filter(Boolean)
  const requestOrigin = request.headers.get('Origin') ?? ''
  const allowOrigin = allowed.length === 0 ? '*' : (allowed.includes(requestOrigin) ? requestOrigin : '')
  if (!allowOrigin) return {}
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Turnstile-Session, Authorization',
    'Access-Control-Max-Age': '86400',
  }
}

export default {
  async fetch(request: Request, env: PluginEnv['Bindings'], ctx: ExecutionContext): Promise<Response> {
    const corsHeaders = buildCorsHeaders(request, env.CORS_ORIGIN)

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders })
    }

    const response = await app.fetch(request, env, ctx)
    const newHeaders = new Headers(response.headers)
    for (const [key, value] of Object.entries(corsHeaders)) {
      newHeaders.set(key, value)
    }
    return new Response(response.body, { status: response.status, headers: newHeaders })
  },

  // Cron Trigger で自動削除を実行する
  // wrangler.jsonc の triggers.crons でスケジュールを設定すること
  async scheduled(_event: ScheduledEvent, env: PluginEnv['Bindings'], ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(
      runCleanup(env).then(({ deleted, errors }) => {
        console.log(`[Cleanup] deleted: ${deleted}, errors: ${errors}`)
      }),
    )
  },
}
