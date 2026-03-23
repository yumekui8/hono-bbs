// plugins/turnstileApiToken - Node.js / Bun 向けエントリポイント
// Linux サーバー等 Cloudflare Workers 以外の環境で実行する場合にこちらを使用する
//
// 使用方法:
//   npm install @hono/node-server ioredis
//   KV_DRIVER=redis REDIS_URL=redis://localhost:6379 node dist/index.node.js
//
// 環境変数:
//   KV_DRIVER            redis | memory (デフォルト: memory)
//   REDIS_URL            redis://localhost:6379
//   KV_PREFIX            KV グローバルプレフィックス (例: "prod:")
//   TURNSTILE_SITE_KEY   Cloudflare Turnstile サイトキー
//   TURNSTILE_SECRET_KEY Cloudflare Turnstile シークレットキー
//   DISABLE_TURNSTILE    'true' でスキップ (ローカル開発用)
//   TURNSTILE_TOKEN_TTL  有効期限 (分単位, 0=無期限, デフォルト: 525600=1年)
//   TURNSTILE_PATH       マウントパス (デフォルト: /auth/turnstile)
//   ALLOW_BBS_UI_DOMAINS 認証後リダイレクト許可ドメイン (カンマ区切り)
//   BBS_ALLOW_DOMAIN     許可ドメイン (カンマ区切り)
//   CORS_ORIGIN          許可 CORS オリジン (カンマ区切り)
//   PORT                 リスンポート (デフォルト: 8788)

import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { trimTrailingSlash } from 'hono/trailing-slash'
import type { PluginEnv } from './types'
import { turnstilePageHandler, turnstileVerifyHandler } from './handler'
import type { KvAdapter } from './adapters/kv'
import { createCloudflareKvAdapter as _unused } from './adapters/kv'

// Node.js 向け KV アダプターファクトリ (ioredis / メモリ)
async function createKvAdapterFromEnv(): Promise<KvAdapter> {
  const driver = process.env.KV_DRIVER ?? 'memory'
  const prefix = process.env.KV_PREFIX ?? ''

  let kv: KvAdapter

  if (driver === 'redis') {
    const { default: Redis } = await import('ioredis')
    const redis = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379')
    kv = {
      async get<T>(key: string, type?: 'json'): Promise<T | null> {
        const value = await redis.get(key)
        if (value === null) return null
        if (type === 'json') {
          try { return JSON.parse(value) as T } catch { return null }
        }
        return value as unknown as T
      },
      async put(key, value, options) {
        if (options?.expirationTtl) {
          await redis.set(key, value, 'EX', options.expirationTtl)
        } else {
          await redis.set(key, value)
        }
      },
      async delete(key) { await redis.del(key) },
    }
  } else {
    // インメモリ KV (開発・テスト用)
    const store = new Map<string, { value: string; expiresAt?: number }>()
    const cleanup = setInterval(() => {
      const now = Date.now()
      for (const [key, entry] of store) {
        if (entry.expiresAt && entry.expiresAt < now) store.delete(key)
      }
    }, 60_000)
    cleanup.unref?.()
    kv = {
      async get<T>(key: string, type?: 'json'): Promise<T | null> {
        const entry = store.get(key)
        if (!entry) return null
        if (entry.expiresAt && entry.expiresAt < Date.now()) { store.delete(key); return null }
        if (type === 'json') {
          try { return JSON.parse(entry.value) as T } catch { return null }
        }
        return entry.value as unknown as T
      },
      async put(key, value, options) {
        const expiresAt = options?.expirationTtl ? Date.now() + options.expirationTtl * 1000 : undefined
        store.set(key, { value, expiresAt })
      },
      async delete(key) { store.delete(key) },
    }
  }

  if (!prefix) return kv
  // プレフィックスラッパー
  return {
    get<T>(key: string, type?: 'json') { return kv.get<T>(prefix + key, type) },
    put(key, value, options) { return kv.put(prefix + key, value, options) },
    delete(key) { return kv.delete(prefix + key) },
  }
}

async function main() {
  const kv: KvAdapter = await createKvAdapterFromEnv()
  console.log(`[turnstileApiToken] KV driver: ${process.env.KV_DRIVER ?? 'memory'}`)

  const mountPath = (process.env.TURNSTILE_PATH ?? '/auth/turnstile').replace(/\/$/, '')

  const app = new Hono<PluginEnv>()
  app.use(trimTrailingSlash())

  // Node.js 環境: 起動時に生成した KV アダプターをコンテキストに注入
  app.use('*', async (c, next) => {
    c.set('kv', kv)
    await next()
  })

  app.get(mountPath, turnstilePageHandler)
  app.post(mountPath, turnstileVerifyHandler)

  app.onError((err, c) => {
    console.error(err)
    return c.json({ error: 'INTERNAL_SERVER_ERROR', message: 'An error occurred' }, 500)
  })

  const corsOrigin = process.env.CORS_ORIGIN
  const allowDomain = process.env.BBS_ALLOW_DOMAIN

  function buildCorsHeaders(request: Request): HeadersInit {
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

  const port = Number(process.env.PORT ?? 8788)

  serve({
    fetch: async (request: Request) => {
      const corsHeaders = buildCorsHeaders(request)

      if (request.method === 'OPTIONS') {
        return new Response(null, { status: 204, headers: corsHeaders })
      }

      // ドメイン制限チェック
      if (allowDomain) {
        const host = new URL(request.url).hostname
        const allowed = allowDomain.split(',').map(d => d.trim()).filter(Boolean)
        if (allowed.length > 0 && !allowed.some(d => host === d || host.endsWith(`.${d}`))) {
          return Response.json(
            { error: 'FORBIDDEN', message: 'This domain is not allowed' },
            { status: 403, headers: corsHeaders },
          )
        }
      }

      const env: PluginEnv['Bindings'] = {
        SESSION_KV: null as never, // Node.js ではアダプター経由なので不使用
        TURNSTILE_SITE_KEY: process.env.TURNSTILE_SITE_KEY,
        TURNSTILE_SECRET_KEY: process.env.TURNSTILE_SECRET_KEY,
        DISABLE_TURNSTILE: process.env.DISABLE_TURNSTILE,
        TURNSTILE_TOKEN_TTL: process.env.TURNSTILE_TOKEN_TTL,
        TURNSTILE_PATH: mountPath,
        ALLOW_BBS_UI_DOMAINS: process.env.ALLOW_BBS_UI_DOMAINS,
        BBS_ALLOW_DOMAIN: allowDomain,
        CORS_ORIGIN: corsOrigin,
      }

      const response = await app.fetch(request, env)
      const newHeaders = new Headers(response.headers)
      for (const [key, value] of Object.entries(corsHeaders)) {
        newHeaders.set(key, value)
      }
      return new Response(response.body, { status: response.status, headers: newHeaders })
    },
    port,
  })

  console.log(`[turnstileApiToken] Server running on http://localhost:${port}${mountPath}`)
}

main().catch(err => {
  console.error('[turnstileApiToken] Fatal error:', err)
  process.exit(1)
})
