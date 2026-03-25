import type { Context } from 'hono'
import type { AppEnv } from '../types'
import { isZodError, zodMessage } from '../utils/zodHelper'
import * as identityService from '../services/identityService'
import { getSystemIds } from '../utils/constants'

// GET /profile - 自分のプロフィール取得
export async function getProfileHandler(c: Context<AppEnv>): Promise<Response> {
  const userId = c.get('userId')!
  const user = await identityService.getUser(c.get('db'), userId, userId, true)
  if (!user) return c.json({ error: 'USER_NOT_FOUND', message: 'User not found' }, 404)
  return c.json({ data: user })
}

// PUT /profile - 自分のプロフィール更新 (パスワード変更も同時に可能)
export async function updateProfileHandler(c: Context<AppEnv>): Promise<Response> {
  const userId = c.get('userId')!
  try {
    const body = await c.req.json()
    const input = identityService.parseUpdateProfile(body)
    const user = await identityService.updateProfile(c.get('db'), userId, input)
    if (!user) return c.json({ error: 'USER_NOT_FOUND', message: 'User not found' }, 404)
    return c.json({ data: user })
  } catch (e) {
    if (isZodError(e)) return c.json({ error: 'VALIDATION_ERROR', message: zodMessage(e) }, 400)
    if (e instanceof Error) {
      if (e.message === 'USER_NOT_FOUND') return c.json({ error: 'USER_NOT_FOUND', message: 'User not found' }, 404)
      if (e.message === 'INVALID_PASSWORD') return c.json({ error: 'INVALID_PASSWORD', message: 'Current password is incorrect' }, 400)
    }
    throw e
  }
}

// DELETE /profile - 自分のアカウント削除
export async function deleteProfileHandler(c: Context<AppEnv>): Promise<Response> {
  const userId = c.get('userId')!
  const sysIds = getSystemIds(c.env)
  try {
    await identityService.deleteMe(c.get('db'), userId, sysIds)
    return new Response(null, { status: 204 })
  } catch (e) {
    if (e instanceof Error) {
      if (e.message === 'USER_NOT_FOUND') return c.json({ error: 'USER_NOT_FOUND', message: 'User not found' }, 404)
      if (e.message === 'CANNOT_DELETE_SYSTEM_USER') return c.json({ error: 'FORBIDDEN', message: 'Cannot delete system user' }, 403)
    }
    throw e
  }
}
