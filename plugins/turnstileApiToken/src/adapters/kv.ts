// KVアダプター (plugin 用ローカル定義)
// src/adapters/kv.ts と同じインターフェース

export interface KvAdapter {
  get<T = string>(key: string, type?: 'json'): Promise<T | null>
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>
  delete(key: string): Promise<void>
}

// Cloudflare KV を KvAdapter にラップする
export function createCloudflareKvAdapter(kv: KVNamespace): KvAdapter {
  return {
    get<T>(key: string, type?: 'json'): Promise<T | null> {
      if (type === 'json') return kv.get<T>(key, 'json')
      return kv.get(key) as Promise<T | null>
    },
    put(key, value, options) {
      return kv.put(key, value, options ?? {})
    },
    delete(key) {
      return kv.delete(key)
    },
  }
}
