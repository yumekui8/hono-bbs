// KVアダプター: Cloudflare KV / Redis を同一インターフェースで扱う
// Node.js 向け実装は src/adapters/kv.node.ts を参照

// KV ストアの共通インターフェース
// Cloudflare KV, Redis すべてに同一 API を提供する
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

// KvAdapter にグローバルプレフィックスを付与するラッパー
// 複数インスタンスで同一 KV ネームスペース / Redis DB を共有する際のキー衝突を防ぐ
// 環境変数 KV_PREFIX で設定する。例: "prod:" → キーが "prod:session:{id}" になる
export function withKvPrefix(kv: KvAdapter, prefix: string): KvAdapter {
  if (!prefix) return kv
  return {
    get<T>(key: string, type?: 'json'): Promise<T | null> {
      return kv.get<T>(prefix + key, type)
    },
    put(key, value, options) {
      return kv.put(prefix + key, value, options)
    },
    delete(key) {
      return kv.delete(prefix + key)
    },
  }
}
