import { z } from 'zod'
import type { User, Session, TurnstileSession } from '../types'
import * as userRepository from '../repository/userRepository'
import * as sessionRepository from '../repository/sessionRepository'
import { hashPassword, verifyPassword } from '../utils/password'

const loginSchema = z.object({
  id: z.string().min(1),
  password: z.string().min(1),
})

export type LoginInput = z.infer<typeof loginSchema>

export function parseLogin(data: unknown): LoginInput {
  return loginSchema.parse(data)
}

export async function login(
  db: D1Database,
  kv: KVNamespace,
  input: LoginInput,
): Promise<{ user: User; session: Session }> {
  // id でユーザを取得 (無効化されたアカウントはログイン不可)
  const result = await userRepository.findUserByIdWithHash(db, input.id)
  if (!result || !result.user.isActive) throw new Error('INVALID_CREDENTIALS')

  const ok = await verifyPassword(input.password, result.passwordHash)
  if (!ok) throw new Error('INVALID_CREDENTIALS')

  const now = new Date()
  // セッション有効期限: 24時間
  const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString()
  const session: Session = {
    id: crypto.randomUUID(),
    userId: result.user.id,
    isActive: true,
    createdAt: now.toISOString(),
    expiresAt,
  }
  await sessionRepository.insertSession(kv, session)
  return { user: result.user, session }
}

export async function logout(kv: KVNamespace, sessionId: string): Promise<void> {
  await sessionRepository.deleteSession(kv, sessionId)
}

// admin の初期パスワードを設定する (一回限り)
// adminUserId は ADMIN_USERNAME 環境変数から解決したものを渡す
export async function setup(db: D1Database, adminInitialPassword: string, adminUserId: string): Promise<void> {
  const result = await userRepository.findUserByIdWithHash(db, adminUserId)
  if (!result) throw new Error('ADMIN_NOT_FOUND')
  if (result.passwordHash !== '__NEEDS_SETUP__') throw new Error('ALREADY_SETUP')
  const newHash = await hashPassword(adminInitialPassword)
  await userRepository.updateUserPassword(db, adminUserId, newHash, new Date().toISOString())
}

export type TurnstileResult =
  | { sessionId: string; alreadyIssued: boolean; errorCodes?: never }
  | { sessionId: null; alreadyIssued?: never; errorCodes: string[] }

// クライアントIP + UA + 日付(UTC)のハッシュから決定論的セッションIDを生成
async function computeClientSessionId(ip: string, userAgent: string, date: string): Promise<string> {
  const raw = `${ip}:${userAgent}:${date}`
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw))
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('')
}

// Turnstile トークンを検証してセッションを発行する
// 同一クライアントから同日に既にセッションが存在する場合は alreadyIssued: true を返す
export async function issueTurnstileSession(
  kv: KVNamespace,
  token: string,
  secretKey: string | undefined,
  clientIP: string,
  userAgent: string,
): Promise<TurnstileResult> {
  if (!secretKey) {
    console.error('[Turnstile] TURNSTILE_SECRET_KEY is not configured')
    return { sessionId: null, errorCodes: ['secret-not-configured'] }
  }

  // 決定論的セッションID (IP + UA + 日付)
  const today = new Date().toISOString().slice(0, 10) // UTC YYYY-MM-DD
  const sessionId = await computeClientSessionId(clientIP, userAgent, today)

  // 既存セッションがあれば KV 書き込みをスキップして返す
  const existing = await sessionRepository.findTurnstileSessionById(kv, sessionId)
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
  const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString()
  const session: TurnstileSession = { id: sessionId, createdAt: now.toISOString(), expiresAt }
  try {
    await sessionRepository.insertTurnstileSession(kv, session)
  } catch (e) {
    console.error('[Turnstile] KV write failed:', e)
    return { sessionId: null, errorCodes: ['kv-write-failed'] }
  }
  return { sessionId, alreadyIssued: false }
}
