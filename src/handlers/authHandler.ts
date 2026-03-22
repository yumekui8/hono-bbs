import type { Context } from 'hono'
import { isZodError, zodMessage } from '../utils/zodHelper'
import type { AppEnv } from '../types'
import * as authService from '../services/authService'
import { getSystemIds } from '../utils/constants'
import { parseEndpointPermissions, getEndpointPermConfig } from '../utils/endpointPermissions'

// GET /auth/setup - セットアップエンドポイントの権限情報を返す
export async function getSetupInfoHandler(c: Context<AppEnv>): Promise<Response> {
  const sysIds = getSystemIds(c.env)
  const customPerms = parseEndpointPermissions(c.env.ENDPOINT_PERMISSIONS)
  const config = getEndpointPermConfig('/auth/setup', customPerms, sysIds)
  return c.json({ data: config })
}

// GET /auth/login - ログインエンドポイントの権限情報を返す
export async function getLoginInfoHandler(c: Context<AppEnv>): Promise<Response> {
  const sysIds = getSystemIds(c.env)
  const customPerms = parseEndpointPermissions(c.env.ENDPOINT_PERMISSIONS)
  const config = getEndpointPermConfig('/auth/login', customPerms, sysIds)
  return c.json({ data: config })
}

// GET /auth/logout - ログアウトエンドポイントの権限情報を返す
export async function getLogoutInfoHandler(c: Context<AppEnv>): Promise<Response> {
  const sysIds = getSystemIds(c.env)
  const customPerms = parseEndpointPermissions(c.env.ENDPOINT_PERMISSIONS)
  const config = getEndpointPermConfig('/auth/logout', customPerms, sysIds)
  return c.json({ data: config })
}

// POST /auth/setup - admin 初期パスワード設定 (一回限り)
export async function setupHandler(c: Context<AppEnv>): Promise<Response> {
  const adminInitialPassword = c.env.ADMIN_INITIAL_PASSWORD
  if (!adminInitialPassword) {
    return c.json({ error: 'SETUP_NOT_CONFIGURED', message: 'ADMIN_INITIAL_PASSWORD is not configured' }, 500)
  }
  const { adminUserId } = getSystemIds(c.env)
  try {
    await authService.setup(c.env.DB, adminInitialPassword, adminUserId)
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
    const { user, session } = await authService.login(c.env.DB, c.env.SESSION_KV, input)
    return c.json({ data: { sessionId: session.id, userId: user.id, displayName: user.displayName, expiresAt: session.expiresAt } })
  } catch (e) {
    if (isZodError(e)) return c.json({ error: 'VALIDATION_ERROR', message: zodMessage(e) }, 400)
    if (e instanceof Error && e.message === 'INVALID_CREDENTIALS') {
      return c.json({ error: 'INVALID_CREDENTIALS', message: 'Invalid username or password' }, 401)
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
  await authService.logout(c.env.SESSION_KV, sessionId)
  return new Response(null, { status: 204 })
}
