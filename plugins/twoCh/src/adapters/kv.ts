// KV アダプター (plugins/twoCh 用コピー)
// 本体の src/adapters/kv.ts と同一インターフェース

export interface KvAdapter {
  get<T = string>(key: string, type?: 'json'): Promise<T | null>
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>
  delete(key: string): Promise<void>
}

export function createCloudflareKvAdapter(kv: KVNamespace): KvAdapter {
  return {
    get<T>(key: string, type?: 'json'): Promise<T | null> {
      if (type === 'json') return kv.get<T>(key, 'json')
      return kv.get(key) as Promise<T | null>
    },
    put(key, value, options) { return kv.put(key, value, options ?? {}) },
    delete(key)             { return kv.delete(key) },
  }
}

export function withKvPrefix(kv: KvAdapter, prefix: string): KvAdapter {
  if (!prefix) return kv
  return {
    get<T>(key: string, type?: 'json'): Promise<T | null> {
      return kv.get<T>(prefix + key, type)
    },
    put(key, value, options) { return kv.put(prefix + key, value, options) },
    delete(key)             { return kv.delete(prefix + key) },
  }
}
