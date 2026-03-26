import type { TurnstileSession } from './types'
import type { KvAdapter } from './adapters/kv'
import * as repository from './repository'

export type TurnstileResult =
  | { sessionId: string; alreadyIssued: boolean; errorCodes?: never }
  | { sessionId: null; alreadyIssued?: never; errorCodes: string[] }

// TURNSTILE_TOKEN_TTL (分) を解析して返す
export function parseTurnstileTtl(raw: string | undefined): { minutes: number; label: string } {
  const minutes = Math.max(0, parseInt(raw ?? '525600', 10) || 525600)
  if (minutes === 0) return { minutes, label: '有効期限なし' }
  if (minutes < 60) return { minutes, label: `${minutes} 分` }
  if (minutes < 60 * 24) return { minutes, label: `${Math.round(minutes / 60)} 時間` }
  if (minutes < 60 * 24 * 365) return { minutes, label: `${Math.round(minutes / (60 * 24))} 日` }
  return { minutes, label: `${Math.round(minutes / (60 * 24 * 365))} 年` }
}

// IP + UA + 日付(UTC) + ペッパー からセッションIDを生成する
// ペッパーはシークレットとして環境変数で管理する
async function computeSessionId(ip: string, userAgent: string, date: string, pepper: string): Promise<string> {
  const raw = `${ip}:${userAgent}:${date}:${pepper}`
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw))
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('')
}

// Turnstile トークンを検証してセッションを発行する
// セッションIDは hash(IP+UA+日付+ペッパー) で決定論的に生成するため、
// 同一クライアント・同日の重複発行を KV lookup なしで dedup できる (KV 書き込みは1回のみ)
// ttlMinutes: セッション有効期限 (分単位)。0 = 無期限 (デフォルト: 525600 = 1年)
export async function issueTurnstileSession(
  kv: KvAdapter,
  token: string,
  secretKey: string | undefined,
  clientIP: string,
  userAgent: string,
  ttlMinutes: number = 525600,
  pepper: string = '',
): Promise<TurnstileResult> {
  if (!secretKey) {
    console.error('[Turnstile] TURNSTILE_SECRET_KEY is not configured')
    return { sessionId: null, errorCodes: ['secret-not-configured'] }
  }

  const today = new Date().toISOString().slice(0, 10) // UTC YYYY-MM-DD
  const sessionId = await computeSessionId(clientIP, userAgent, today, pepper)

  // 同一端末・同日のセッションが既に存在すれば KV 書き込みなしで返す
  const existing = await repository.findTurnstileSessionById(kv, sessionId)
  if (existing) {
    return { sessionId, alreadyIssued: true }
  }

  // Cloudflare siteverify
  const params = new URLSearchParams({ secret: secretKey, response: token })
  const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  })
  const data = await res.json<{ success: boolean; 'error-codes'?: string[] }>()
  if (!data.success) {
    const errorCodes = data['error-codes'] ?? ['unknown']
    console.error('[Turnstile] siteverify failed:', errorCodes)
    return { sessionId: null, errorCodes }
  }

  const now = new Date()
  // ttlMinutes=0 のとき有効期限なし (expiresAt に十分先の日付を設定して期限チェックをスキップ)
  const expiresAt = ttlMinutes === 0
    ? '9999-12-31T23:59:59.999Z'
    : new Date(now.getTime() + ttlMinutes * 60 * 1000).toISOString()
  const session: TurnstileSession = { id: sessionId, createdAt: now.toISOString(), expiresAt, clientIP, userAgent }
  try {
    await repository.insertTurnstileSession(kv, session, ttlMinutes)
  } catch (e) {
    console.error('[Turnstile] KV write failed:', e)
    return { sessionId: null, errorCodes: ['kv-write-failed'] }
  }
  return { sessionId, alreadyIssued: false }
}
