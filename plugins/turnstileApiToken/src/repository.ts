import type { TurnstileSession } from './types'
import type { KvAdapter } from './adapters/kv'

const TURNSTILE_PREFIX = 'turnstile:'
// ルックアップキー: hash(IP+UA+date) → セッションID のマッピング
// クライアントには渡さない内部キー。セッションIDは別途乱数で生成する
const TURNSTILE_LOOKUP_PREFIX = 'turnstile_lookup:'

export async function findTurnstileSessionById(
  kv: KvAdapter,
  id: string,
): Promise<TurnstileSession | null> {
  const data = await kv.get<TurnstileSession>(TURNSTILE_PREFIX + id, 'json')
  if (!data) return null
  if (new Date(data.expiresAt) < new Date()) {
    await kv.delete(TURNSTILE_PREFIX + id)
    return null
  }
  return data
}

// 同一クライアント(IP+UA+日付)に対して既に発行済みのセッションIDを取得する
// 存在すれば KV 書き込みなしで再利用できる
export async function findSessionIdByLookupKey(
  kv: KvAdapter,
  lookupKey: string,
): Promise<string | null> {
  return kv.get(TURNSTILE_LOOKUP_PREFIX + lookupKey)
}

export async function insertTurnstileSession(
  kv: KvAdapter,
  session: TurnstileSession,
  lookupKey: string,  // hash(IP+UA+date) — KV 内部でのみ使用
  ttlMinutes: number, // 0 = 無期限
): Promise<void> {
  const options: { expirationTtl?: number } = ttlMinutes > 0
    ? { expirationTtl: ttlMinutes * 60 }
    : {}
  // セッション本体と lookupKey → sessionId マッピングを同じ TTL で保存
  await kv.put(TURNSTILE_PREFIX + session.id, JSON.stringify(session), options)
  await kv.put(TURNSTILE_LOOKUP_PREFIX + lookupKey, session.id, options)
}
