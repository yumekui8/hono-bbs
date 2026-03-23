// Node.js 向け KV アダプター実装
// Redis (ioredis) をサポート
// 使用には npm install ioredis が必要
//
// 環境変数:
//   KV_DRIVER=redis | memory (デフォルト: memory)
//   REDIS_URL=redis://localhost:6379
//   KV_PREFIX=bbs:  (オプション: 複数インスタンスでの衝突防止)

import type { KvAdapter } from './kv'
import { withKvPrefix } from './kv'

// インメモリ KV (開発・テスト用。TTL は setTimeout で管理)
export function createMemoryKvAdapter(): KvAdapter {
  const store = new Map<string, { value: string; expiresAt?: number }>()

  // 期限切れエントリを定期クリーンアップ
  const cleanup = setInterval(() => {
    const now = Date.now()
    for (const [key, entry] of store) {
      if (entry.expiresAt && entry.expiresAt < now) store.delete(key)
    }
  }, 60_000)
  // Node.js プロセス終了時にクリアされる
  cleanup.unref?.()

  return {
    async get<T>(key: string, type?: 'json'): Promise<T | null> {
      const entry = store.get(key)
      if (!entry) return null
      if (entry.expiresAt && entry.expiresAt < Date.now()) {
        store.delete(key)
        return null
      }
      if (type === 'json') {
        try { return JSON.parse(entry.value) as T } catch { return null }
      }
      return entry.value as unknown as T
    },
    async put(key, value, options) {
      const expiresAt = options?.expirationTtl
        ? Date.now() + options.expirationTtl * 1000
        : undefined
      store.set(key, { value, expiresAt })
    },
    async delete(key) {
      store.delete(key)
    },
  }
}

// ioredis の Redis クライアントを KvAdapter にラップする
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createRedisAdapter(redis: any): KvAdapter {
  return {
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
    async delete(key) {
      await redis.del(key)
    },
  }
}

// 環境変数から KV アダプターを生成するファクトリ関数
// KV_DRIVER: "redis" | "memory" (デフォルト: memory)
// REDIS_URL: Redis 接続文字列
// KV_PREFIX: グローバルプレフィックス (オプション)
export async function createKvAdapterFromEnv(): Promise<KvAdapter> {
  const driver = process.env.KV_DRIVER ?? 'memory'
  const prefix = process.env.KV_PREFIX ?? ''

  let kv: KvAdapter

  if (driver === 'redis') {
    const { default: Redis } = await import('ioredis')
    const redis = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379')
    kv = createRedisAdapter(redis)
  } else {
    kv = createMemoryKvAdapter()
  }

  return withKvPrefix(kv, prefix)
}
