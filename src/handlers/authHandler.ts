import type { Context } from 'hono'
import { isZodError, zodMessage } from '../utils/zodHelper'
import type { AppEnv } from '../types'
import * as authService from '../services/authService'
import { getSystemIds } from '../utils/constants'

// POST /auth/setup - admin 初期パスワード設定 (一回限り)
export async function setupHandler(c: Context<AppEnv>): Promise<Response> {
  const adminInitialPassword = c.env.ADMIN_INITIAL_PASSWORD
  if (!adminInitialPassword) {
    return c.json({ error: 'SETUP_NOT_CONFIGURED', message: 'ADMIN_INITIAL_PASSWORD is not configured' }, 500)
  }
  const { adminUserId } = getSystemIds(c.env)
  try {
    await authService.setup(c.get('db'), adminInitialPassword, adminUserId)
    return c.json({ data: { message: 'Admin password has been set' } })
  } catch (e) {
    if (e instanceof Error) {
      if (e.message === 'ADMIN_NOT_FOUND') {
        return c.json({ error: 'SETUP_FAILED', message: 'Admin user not found. Run init.sql first.' }, 500)
      }
      if (e.message === 'ALREADY_SETUP') {
        return c.json({ error: 'ALREADY_SETUP', message: 'Admin password is already set' }, 409)
      }
    }
    throw e
  }
}

// POST /auth/login
export async function loginHandler(c: Context<AppEnv>): Promise<Response> {
  try {
    const body = await c.req.json()
    const input = authService.parseLogin(body)
    const { user, session } = await authService.login(c.get('db'), c.get('kv'), input)
    return c.json({ data: { sessionId: session.id, userId: user.id, displayName: user.displayName, expiresAt: session.expiresAt } })
  } catch (e) {
    if (isZodError(e)) return c.json({ error: 'VALIDATION_ERROR', message: zodMessage(e) }, 400)
    if (e instanceof Error && e.message === 'INVALID_CREDENTIALS') {
      return c.json({ error: 'INVALID_CREDENTIALS', message: 'Invalid username or password' }, 401)
    }
    if (e instanceof Error && e.message === 'TOO_MANY_ATTEMPTS') {
      return c.json({ error: 'TOO_MANY_ATTEMPTS', message: 'Too many failed login attempts. Please try again later.' }, 429)
    }
    throw e
  }
}

// POST /auth/logout
export async function logoutHandler(c: Context<AppEnv>): Promise<Response> {
  const sessionId = c.req.header('X-Session-Id')
  if (!sessionId) {
    return c.json({ error: 'UNAUTHORIZED', message: 'X-Session-Id header required' }, 401)
  }
  await authService.logout(c.get('kv'), sessionId)
  return new Response(null, { status: 204 })
}
