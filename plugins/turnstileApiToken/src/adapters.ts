// プラグイン用アダプターセットアップミドルウェア
// リクエストごとに KV アダプターを生成して Context にセットする

import type { MiddlewareHandler } from 'hono'
import type { PluginEnv } from './types'
import { createCloudflareKvAdapter } from './adapters/kv'

export const setupAdapters: MiddlewareHandler<PluginEnv> = async (c, next) => {
  // すでにセットされている場合はスキップ
  if (c.get('kv')) {
    await next()
    return
  }

  if (c.env.SESSION_KV) {
    c.set('kv', createCloudflareKvAdapter(c.env.SESSION_KV))
  }

  await next()
}
