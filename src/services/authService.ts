import { z } from 'zod'
import type { User, Session } from '../types'
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

