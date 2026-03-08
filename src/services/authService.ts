import { z } from 'zod'
import type { User, Session, TurnstileSession } from '../types'
import * as userRepository from '../repository/userRepository'
import * as groupRepository from '../repository/groupRepository'
import * as sessionRepository from '../repository/sessionRepository'
import { hashPassword, verifyPassword } from '../utils/password'
import { SYSTEM_ADMIN_USER_ID, SYSTEM_GENERAL_GROUP_ID } from '../utils/constants'

const registerSchema = z.object({
  username: z.string().min(1).max(50).regex(/^[a-zA-Z0-9_-]+$/, 'username は英数字・_・- のみ使用できます'),
  password: z.string().min(8).max(100),
})

const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
})

export type RegisterInput = z.infer<typeof registerSchema>
export type LoginInput = z.infer<typeof loginSchema>

export function parseRegister(data: unknown): RegisterInput {
  return registerSchema.parse(data)
}

export function parseLogin(data: unknown): LoginInput {
  return loginSchema.parse(data)
}

export async function register(db: D1Database, input: RegisterInput): Promise<User> {
  const existing = await userRepository.findUserByUsername(db, input.username)
  if (existing) throw new Error('USERNAME_TAKEN')

  const now = new Date().toISOString()
  const userId = crypto.randomUUID()
  const passwordHash = await hashPassword(input.password)

  // 新規ユーザは sys-general-group をプライマリグループとして所属させる
  await userRepository.insertUser(db, userId, input.username, passwordHash, SYSTEM_GENERAL_GROUP_ID, now)
  await groupRepository.insertUserGroup(db, userId, SYSTEM_GENERAL_GROUP_ID)

  return { id: userId, username: input.username, primaryGroupId: SYSTEM_GENERAL_GROUP_ID, createdAt: now }
}

export async function login(
  db: D1Database,
  kv: KVNamespace,
  input: LoginInput,
): Promise<{ user: User; session: Session }> {
  const result = await userRepository.findUserWithHash(db, input.username)
  if (!result) throw new Error('INVALID_CREDENTIALS')

  const ok = await verifyPassword(input.password, result.passwordHash)
  if (!ok) throw new Error('INVALID_CREDENTIALS')

  const now = new Date()
  // セッション有効期限: 24時間
  const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString()
  const session: Session = {
    id: crypto.randomUUID(),
    userId: result.user.id,
    createdAt: now.toISOString(),
    expiresAt,
  }
  await sessionRepository.insertSession(kv, session)
  return { user: result.user, session }
}

export async function logout(kv: KVNamespace, sessionId: string): Promise<void> {
  await sessionRepository.deleteSession(kv, sessionId)
}

export async function getMe(db: D1Database, kv: KVNamespace, sessionId: string): Promise<User | null> {
  const session = await sessionRepository.findSessionById(kv, sessionId)
  if (!session) return null
  return userRepository.findUserById(db, session.userId)
}

// admin の初期パスワードを設定する (一回限り)
export async function setup(db: D1Database, adminInitialPassword: string): Promise<void> {
  const result = await userRepository.findUserByIdWithHash(db, SYSTEM_ADMIN_USER_ID)
  if (!result) throw new Error('ADMIN_NOT_FOUND')
  if (result.passwordHash !== '__NEEDS_SETUP__') throw new Error('ALREADY_SETUP')
  const newHash = await hashPassword(adminInitialPassword)
  await userRepository.updateUserPassword(db, SYSTEM_ADMIN_USER_ID, newHash)
}

export type TurnstileResult =
  | { sessionId: string; errorCodes?: never }
  | { sessionId: null; errorCodes: string[] }

// Turnstile トークンを検証してセッションを発行する
export async function issueTurnstileSession(
  kv: KVNamespace,
  token: string,
  secretKey: string | undefined,
): Promise<TurnstileResult> {
  if (!secretKey) {
    console.error('[Turnstile] TURNSTILE_SECRET_KEY is not configured')
    return { sessionId: null, errorCodes: ['secret-not-configured'] }
  }
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
  const session: TurnstileSession = {
    id: crypto.randomUUID(),
    createdAt: now.toISOString(),
    expiresAt,
  }
  await sessionRepository.insertTurnstileSession(kv, session)
  return { sessionId: session.id }
}
