// plugins/twoCh - Node.js / Bun 向けエントリポイント
// Linux サーバー等 Cloudflare Workers 以外の環境で実行する場合にこちらを使用する
//
// 使用方法:
//   npm install @hono/node-server better-sqlite3
//   DB_DRIVER=sqlite DATABASE_URL=./hono-bbs.db node dist/index.node.js
//
// 必要な追加パッケージ (使用するドライバーに応じてインストール):
//   SQLite:    npm install better-sqlite3
//   MySQL:     npm install mysql2
//   Redis KV:  npm install ioredis
//
// 環境変数:
//   DB_DRIVER    sqlite | mysql | postgresql (デフォルト: sqlite)
//   DATABASE_URL 接続文字列 (デフォルト: ./hono-bbs.db)
//   KV_DRIVER    redis | memory (デフォルト: memory)
//   REDIS_URL    redis://localhost:6379
//   KV_PREFIX    KV グローバルプレフィックス (例: "prod:")
//   SITE_URL     このサーバーの公開URL (例: "http://localhost:8789")
//   BBS_NAME     掲示板サイト名
//   ENABLE_TURNSTILE 'true' で Turnstile 認証を必須とする
//   TURNSTILE_SITE_KEY / TURNSTILE_SECRET_KEY
//   PORT         リスンポート (デフォルト: 8789)

import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { trimTrailingSlash } from 'hono/trailing-slash'
import type { Env } from './types'
import type { DbAdapter } from './adapters/db'
import type { KvAdapter } from './adapters/kv'
import {
  bbsmenuHandler, subjectTxtHandler, datHandler, settingTxtHandler,
  writeCgiHandler, twoChTurnstilePageHandler, twoChTurnstileVerifyHandler,
} from './handler'

// DB アダプターファクトリ
async function createDbAdapter(): Promise<DbAdapter> {
  const driver = process.env.DB_DRIVER ?? 'sqlite'
  const url = process.env.DATABASE_URL ?? './hono-bbs.db'

  if (driver === 'mysql') {
    const mysql = await import('mysql2/promise')
    const pool = mysql.createPool(url)
    return {
      async first<T>(sql: string, params: unknown[] = []): Promise<T | null> {
        const [rows] = await pool.execute(sql, params)
        return ((rows as T[])[0] ?? null) as T | null
      },
      async all<T>(sql: string, params: unknown[] = []) {
        const [rows] = await pool.execute(sql, params)
        return { results: rows as T[] }
      },
      async run(sql: string, params: unknown[] = []) {
        const [result] = await pool.execute(sql, params)
        return { changes: (result as { affectedRows: number }).affectedRows ?? 0 }
      },
      async batch(queries) {
        const conn = await pool.getConnection()
        try {
          await conn.beginTransaction()
          for (const q of queries) await conn.execute(q.sql, q.params ?? [])
          await conn.commit()
        } catch (e) {
          await conn.rollback()
          throw e
        } finally {
          conn.release()
        }
      },
    }
  }

  // デフォルト: better-sqlite3
  const Database = (await import('better-sqlite3')).default
  const db = new Database(url)
  return {
    async first<T>(sql: string, params: unknown[] = []): Promise<T | null> {
      return (db.prepare(sql).get(...params) as T) ?? null
    },
    async all<T>(sql: string, params: unknown[] = []) {
      return { results: db.prepare(sql).all(...params) as T[] }
    },
    async run(sql: string, params: unknown[] = []) {
      const result = db.prepare(sql).run(...params)
      return { changes: result.changes ?? 0 }
    },
    async batch(queries) {
      const tx = db.transaction(() => {
        for (const q of queries) db.prepare(q.sql).run(...(q.params ?? []))
      })
      tx()
    },
  }
}

// KV アダプターファクトリ
async function createKvAdapter(): Promise<KvAdapter> {
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
    // インメモリ KV
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
  return {
    get<T>(key: string, type?: 'json') { return kv.get<T>(prefix + key, type) },
    put(key, value, options) { return kv.put(prefix + key, value, options) },
    delete(key) { return kv.delete(prefix + key) },
  }
}

async function main() {
  const db: DbAdapter = await createDbAdapter()
  const kv: KvAdapter = await createKvAdapter()

  console.log(`[twoCh] DB driver: ${process.env.DB_DRIVER ?? 'sqlite'}`)
  console.log(`[twoCh] KV driver: ${process.env.KV_DRIVER ?? 'memory'}`)

  const app = new Hono<Env>()
  app.use(trimTrailingSlash())

  // Node.js 環境: 起動時に生成したアダプターをコンテキストに注入
  app.use('*', async (c, next) => {
    c.set('db', db)
    c.set('kv', kv)
    await next()
  })

  app.get('/auth/turnstile', twoChTurnstilePageHandler)
  app.post('/auth/turnstile', twoChTurnstileVerifyHandler)
  app.get('/bbsmenu.html', bbsmenuHandler)
  app.get('/:board/subject.txt', subjectTxtHandler)
  app.get('/:board/dat/:file', datHandler)
  app.get('/:board/SETTING.TXT', settingTxtHandler)
  app.post('/test/bbs.cgi', writeCgiHandler)

  app.onError((err, c) => {
    console.error('[twoCh error]', err)
    return new Response('Internal Server Error', { status: 500 })
  })

  const corsOrigin = process.env.CORS_ORIGIN

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

  const port = Number(process.env.PORT ?? 8789)

  serve({
    fetch: async (request: Request) => {
      const corsHeaders = buildCorsHeaders(request)

      if (request.method === 'OPTIONS') {
        return new Response(null, { status: 204, headers: corsHeaders })
      }

      const env: Env['Bindings'] = {
        BBS_DB: null as never,       // Node.js では DB アダプター経由なので不使用
        SESSION_KV: null as never,   // Node.js では KV アダプター経由なので不使用
        SITE_URL: process.env.SITE_URL,
        BBS_NAME: process.env.BBS_NAME,
        CORS_ORIGIN: corsOrigin,
        ENABLE_TURNSTILE: process.env.ENABLE_TURNSTILE,
        TURNSTILE_SITE_KEY: process.env.TURNSTILE_SITE_KEY,
        TURNSTILE_SECRET_KEY: process.env.TURNSTILE_SECRET_KEY,
        THREAD_OWNER_USER: process.env.THREAD_OWNER_USER,
        THREAD_OWNER_GROUP: process.env.THREAD_OWNER_GROUP,
        POST_OWNER_USER: process.env.POST_OWNER_USER,
        POST_OWNER_GROUP: process.env.POST_OWNER_GROUP,
        KV_PREFIX: process.env.KV_PREFIX,
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

  console.log(`[twoCh] Server running on http://localhost:${port}`)
}

main().catch(err => {
  console.error('[twoCh] Fatal error:', err)
  process.exit(1)
})
