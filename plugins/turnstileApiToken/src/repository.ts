import type { TurnstileSession } from './types'
import type { KvAdapter } from './adapters/kv'

const TURNSTILE_PREFIX = 'turnstile:'

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

export async function insertTurnstileSession(
  kv: KvAdapter,
  session: TurnstileSession,
  ttlMinutes: number, // 0 = 無期限
): Promise<void> {
  const options: { expirationTtl?: number } = ttlMinutes > 0
    ? { expirationTtl: ttlMinutes * 60 }
    : {}
  await kv.put(TURNSTILE_PREFIX + session.id, JSON.stringify(session), options)
}
