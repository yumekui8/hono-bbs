import type { TurnstileSession } from './types'

const TURNSTILE_PREFIX = 'turnstile:'

export async function findTurnstileSessionById(
  kv: KVNamespace,
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
  kv: KVNamespace,
  session: TurnstileSession,
  ttlMinutes: number, // 0 = 無期限
): Promise<void> {
  const options: KVNamespacePutOptions = ttlMinutes > 0
    ? { expirationTtl: ttlMinutes * 60 }
    : {}
  await kv.put(TURNSTILE_PREFIX + session.id, JSON.stringify(session), options)
}
