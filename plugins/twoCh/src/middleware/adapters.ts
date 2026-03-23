// アダプターセットアップミドルウェア (plugins/twoCh 用)
import type { MiddlewareHandler } from 'hono'
import type { Env } from '../types'
import { createD1Adapter } from '../adapters/db'
import { createCloudflareKvAdapter, withKvPrefix } from '../adapters/kv'

export const setupAdapters: MiddlewareHandler<Env> = async (c, next) => {
  if (c.get('db')) { await next(); return }
  if (c.env.BBS_DB)    c.set('db', createD1Adapter(c.env.BBS_DB))
  if (c.env.SESSION_KV) c.set('kv', withKvPrefix(createCloudflareKvAdapter(c.env.SESSION_KV), c.env.KV_PREFIX ?? ''))
  await next()
}
