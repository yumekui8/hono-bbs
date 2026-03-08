import type { Session, TurnstileSession } from '../types'

// KV キープレフィックス
const SESSION_PREFIX    = 'session:'
const TURNSTILE_PREFIX  = 'turnstile:'

// ── ログインセッション ──────────────────────────────────────

export async function findSessionById(kv: KVNamespace, id: string): Promise<Session | null> {
  const data = await kv.get<Session>(SESSION_PREFIX + id, 'json')
  if (!data) return null
  // KV の TTL で自動期限切れするが、念のためチェック
  if (new Date(data.expiresAt) < new Date()) {
    await kv.delete(SESSION_PREFIX + id)
    return null
  }
  return data
}

export async function insertSession(kv: KVNamespace, session: Session): Promise<void> {
  const ttlSeconds = Math.floor((new Date(session.expiresAt).getTime() - Date.now()) / 1000)
  await kv.put(SESSION_PREFIX + session.id, JSON.stringify(session), {
    expirationTtl: Math.max(ttlSeconds, 60),
  })
}

export async function deleteSession(kv: KVNamespace, id: string): Promise<void> {
  await kv.delete(SESSION_PREFIX + id)
}

// ── Turnstile セッション ────────────────────────────────────

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
): Promise<void> {
  const ttlSeconds = Math.floor((new Date(session.expiresAt).getTime() - Date.now()) / 1000)
  await kv.put(TURNSTILE_PREFIX + session.id, JSON.stringify(session), {
    expirationTtl: Math.max(ttlSeconds, 60),
  })
}

export async function deleteTurnstileSession(kv: KVNamespace, id: string): Promise<void> {
  await kv.delete(TURNSTILE_PREFIX + id)
}
