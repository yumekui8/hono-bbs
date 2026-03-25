import type { MiddlewareHandler } from 'hono'
import type { AppEnv } from '../types'
import * as sessionRepository from '../repository/sessionRepository'
import * as roleRepository from '../repository/roleRepository'
import * as userRepository from '../repository/userRepository'
import { getSystemIds } from '../utils/constants'

// 全ルートに適用: セッション・管理者フラグ・ロール一覧をコンテキストに設定する
// 認証失敗でもブロックしない (権限チェックは各サービスで行う)
export const authContext: MiddlewareHandler<AppEnv> = async (c, next) => {
  const sysIds = getSystemIds(c.env)
  const sessionId = c.req.header('X-Session-Id')

  if (sessionId) {
    const session = await sessionRepository.findSessionById(c.get('kv'), sessionId)
    if (session) {
      c.set('userId', session.userId)
      const roleIds = await roleRepository.findRoleIdsByUserId(c.get('db'), session.userId)
      c.set('userRoleIds', roleIds)
      c.set('isSysAdmin',  roleIds.includes(sysIds.adminRoleId))
      c.set('isUserAdmin', roleIds.includes(sysIds.userAdminRoleId))
      const user = await userRepository.findUserById(c.get('db'), session.userId)
      c.set('primaryRoleId', user?.primaryRoleId ?? null)
      await next()
      return
    }
  }

  c.set('userId', null)
  c.set('userRoleIds', [])
  c.set('isSysAdmin', false)
  c.set('isUserAdmin', false)
  c.set('primaryRoleId', null)
  await next()
}

// ログイン必須ミドルウェア
export const requireLogin: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (!c.get('userId')) {
    return c.json({ error: 'UNAUTHORIZED', message: 'Login required' }, 401)
  }
  await next()
}

// userAdminRole メンバー必須 (ユーザ管理操作, requireLogin と併用)
export const requireUserAdminRole: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (!c.get('isUserAdmin')) {
    return c.json({ error: 'FORBIDDEN', message: 'Requires userAdminRole membership' }, 403)
  }
  await next()
}
