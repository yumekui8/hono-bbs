// アダプターセットアップミドルウェア
// リクエストごとに DB / KV アダプターを生成して Context にセットする
//
// Cloudflare Workers 環境: c.env.DB (D1) / c.env.SESSION_KV (KV) をラップする
// Node.js 環境: src/index.node.ts で事前に生成したアダプターが c.get('db')/c.get('kv') に
//              すでにセットされているため何もしない (二重ラップ防止)

import type { MiddlewareHandler } from 'hono'
import type { AppEnv } from '../types'
import { createD1Adapter } from '../adapters/db'
import { createCloudflareKvAdapter, withKvPrefix } from '../adapters/kv'

export const setupAdapters: MiddlewareHandler<AppEnv> = async (c, next) => {
  // Node.js 環境ではエントリポイントで事前にアダプターがセットされる
  if (c.get('db')) {
    await next()
    return
  }

  // Workers 環境: ネイティブバインディングをアダプターにラップする
  if (c.env.DB) {
    c.set('db', createD1Adapter(c.env.DB))
  }
  if (c.env.SESSION_KV) {
    c.set('kv', withKvPrefix(
      createCloudflareKvAdapter(c.env.SESSION_KV),
      c.env.KV_PREFIX ?? '',
    ))
  }

  await next()
}
