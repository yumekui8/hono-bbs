import type { MiddlewareHandler } from 'hono'
import type { AppEnv } from '../types'
import * as sessionRepository from '../repository/sessionRepository'
import * as groupRepository from '../repository/groupRepository'
import * as userRepository from '../repository/userRepository'
import { getSystemIds } from '../utils/constants'

// 全ルートに適用: セッション・管理者フラグ・userToken をコンテキストに設定する
// 認証失敗でもブロックしない (権限チェックは各サービスで行う)
export const authContext: MiddlewareHandler<AppEnv> = async (c, next) => {
  const sysIds = getSystemIds(c.env)
  const sessionId = c.req.header('X-Session-Id')

  if (sessionId) {
    const session = await sessionRepository.findSessionById(c.env.SESSION_KV, sessionId)
    if (session) {
      c.set('userId', session.userId)
      const groupIds = await groupRepository.findGroupIdsByUserId(c.env.DB, session.userId)
      c.set('userGroupIds', groupIds)
      c.set('isAdmin',     groupIds.includes(sysIds.bbsAdminGroupId))
      c.set('isUserAdmin', groupIds.includes(sysIds.userAdminGroupId))
      const user = await userRepository.findUserById(c.env.DB, session.userId)
      c.set('primaryGroupId', user?.primaryGroupId ?? null)
      await next()
      return
    }
  }

  c.set('userId', null)
  c.set('userGroupIds', [])
  c.set('isAdmin', false)
  c.set('isUserAdmin', false)
  c.set('primaryGroupId', null)
  await next()
}

// ログイン必須ミドルウェア
export const requireLogin: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (!c.get('userId')) {
    return c.json({ error: 'UNAUTHORIZED', message: 'Login required' }, 401)
  }
  await next()
}

// bbsAdminGroup メンバー必須 (板の作成など掲示板管理操作, requireLogin と併用)
export const requireBbsAdminGroup: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (!c.get('isAdmin')) {
    return c.json({ error: 'FORBIDDEN', message: 'Requires bbsAdminGroup membership' }, 403)
  }
  await next()
}

// userAdminGroup メンバー必須 (ユーザ管理操作, requireLogin と併用)
export const requireUserAdminGroup: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (!c.get('isUserAdmin')) {
    return c.json({ error: 'FORBIDDEN', message: 'Requires userAdminGroup membership' }, 403)
  }
  await next()
}
