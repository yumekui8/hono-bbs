import { z } from 'zod'
import type { User, Session } from '../types'
import type { DbAdapter } from '../adapters/db'
import type { KvAdapter } from '../adapters/kv'
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

// ログイン失敗レート制限: ユーザIDごとに15分間で10回まで
const LOGIN_FAIL_PREFIX  = 'login_fail:'
const LOGIN_MAX_ATTEMPTS = 10
const LOGIN_FAIL_TTL_SEC = 900 // 15分

export async function login(
  db: DbAdapter,
  kv: KvAdapter,
  input: LoginInput,
): Promise<{ user: User; session: Session }> {
  const failKey = LOGIN_FAIL_PREFIX + input.id

  // 失敗カウントチェック (ロックアウト中は即座に拒否)
  const failStr = await kv.get(failKey)
  const failCount = failStr ? parseInt(failStr, 10) : 0
  if (failCount >= LOGIN_MAX_ATTEMPTS) throw new Error('TOO_MANY_ATTEMPTS')

  // id でユーザを取得 (無効化されたアカウントはログイン不可)
  const result = await userRepository.findUserByIdWithHash(db, input.id)
  if (!result || !result.user.isActive) {
    // 存在しないIDへの試行もカウント (ユーザ列挙攻撃対策として同じエラーを返す)
    await kv.put(failKey, String(failCount + 1), { expirationTtl: LOGIN_FAIL_TTL_SEC })
    throw new Error('INVALID_CREDENTIALS')
  }

  const ok = await verifyPassword(input.password, result.passwordHash)
  if (!ok) {
    await kv.put(failKey, String(failCount + 1), { expirationTtl: LOGIN_FAIL_TTL_SEC })
    throw new Error('INVALID_CREDENTIALS')
  }

  // 認証成功: 失敗カウンターをリセット
  await kv.delete(failKey)

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

export async function logout(kv: KvAdapter, sessionId: string): Promise<void> {
  await sessionRepository.deleteSession(kv, sessionId)
}

// admin の初期パスワードを設定する (一回限り)
// adminUserId は ADMIN_USERNAME 環境変数から解決したものを渡す
export async function setup(db: DbAdapter, adminInitialPassword: string, adminUserId: string): Promise<void> {
  const result = await userRepository.findUserByIdWithHash(db, adminUserId)
  if (!result) throw new Error('ADMIN_NOT_FOUND')
  if (result.passwordHash !== '__NEEDS_SETUP__') throw new Error('ALREADY_SETUP')
  const newHash = await hashPassword(adminInitialPassword)
  await userRepository.updateUserPassword(db, adminUserId, newHash, new Date().toISOString())
}

