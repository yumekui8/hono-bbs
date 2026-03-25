import type { Context } from 'hono'
import type { AppEnv } from '../types'
import { isZodError, zodMessage } from '../utils/zodHelper'
import * as identityService from '../services/identityService'
import { getSystemIds } from '../utils/constants'

// 環境変数から表示件数上限を取得 (0=無制限)
function getLimit(envVal: string | undefined): number {
  const n = parseInt(envVal ?? '0', 10)
  return isNaN(n) || n < 0 ? 0 : n
}

// ── ユーザ操作 ────────────────────────────────────────────

// GET /identity/users?page=<n>
export async function listUsersHandler(c: Context<AppEnv>): Promise<Response> {
  const page = Math.max(1, parseInt(c.req.query('page') ?? '1', 10))
  const limit = getLimit(c.env.USER_DISPLAY_LIMIT)
  const users = await identityService.listUsers(c.get('db'), page, limit)
  return c.json({ data: users, page, limit })
}

// POST /identity/users (ユーザ作成 - Turnstile 必須)
export async function createUserHandler(c: Context<AppEnv>): Promise<Response> {
  const sysIds = getSystemIds(c.env)
  try {
    const body = await c.req.json()
    const input = identityService.parseCreateUser(body)
    const user = await identityService.createUser(c.get('db'), input, sysIds)
    return c.json({ data: user }, 201)
  } catch (e) {
    if (isZodError(e)) return c.json({ error: 'VALIDATION_ERROR', message: zodMessage(e) }, 400)
    if (e instanceof Error && e.message === 'USER_ID_TAKEN') {
      return c.json({ error: 'USER_ID_TAKEN', message: 'This user ID is already taken' }, 409)
    }
    throw e
  }
}

// GET /identity/users/:id
export async function getUserHandler(c: Context<AppEnv>): Promise<Response> {
  const targetId = c.req.param('id')
  try {
    const user = await identityService.getUser(c.get('db'), targetId, c.get('userId'), c.get('isUserAdmin'))
    if (!user) return c.json({ error: 'USER_NOT_FOUND', message: 'User not found' }, 404)
    return c.json({ data: user })
  } catch (e) {
    if (e instanceof Error && e.message === 'FORBIDDEN') {
      return c.json({ error: 'FORBIDDEN', message: 'Insufficient permissions' }, 403)
    }
    throw e
  }
}

// PUT /identity/users/:id (管理者による任意ユーザ更新: isActive 含む)
export async function updateUserHandler(c: Context<AppEnv>): Promise<Response> {
  const targetId = c.req.param('id')
  try {
    const body = await c.req.json()
    const input = identityService.parseUpdateUserAdmin(body)
    const user = await identityService.updateUser(c.get('db'), targetId, input, c.get('userId'), c.get('isUserAdmin'))
    if (!user) return c.json({ error: 'USER_NOT_FOUND', message: 'User not found' }, 404)
    return c.json({ data: user })
  } catch (e) {
    if (isZodError(e)) return c.json({ error: 'VALIDATION_ERROR', message: zodMessage(e) }, 400)
    if (e instanceof Error) {
      if (e.message === 'FORBIDDEN') return c.json({ error: 'FORBIDDEN', message: 'Insufficient permissions' }, 403)
      if (e.message === 'USER_NOT_FOUND') return c.json({ error: 'USER_NOT_FOUND', message: 'User not found' }, 404)
    }
    throw e
  }
}

// DELETE /identity/users/:id (userAdminRole 専用)
export async function deleteUserHandler(c: Context<AppEnv>): Promise<Response> {
  const targetId = c.req.param('id')
  const sysIds = getSystemIds(c.env)
  try {
    await identityService.deleteUser(c.get('db'), targetId, sysIds)
    return new Response(null, { status: 204 })
  } catch (e) {
    if (e instanceof Error) {
      if (e.message === 'USER_NOT_FOUND') return c.json({ error: 'USER_NOT_FOUND', message: 'User not found' }, 404)
      if (e.message === 'CANNOT_DELETE_SYSTEM_USER') return c.json({ error: 'FORBIDDEN', message: 'Cannot delete system user' }, 403)
    }
    throw e
  }
}

// ── ロール操作 ──────────────────────────────────────────

// GET /identity/roles?page=<n>
export async function listRolesHandler(c: Context<AppEnv>): Promise<Response> {
  const page = Math.max(1, parseInt(c.req.query('page') ?? '1', 10))
  const limit = getLimit(c.env.ROLE_DISPLAY_LIMIT)
  const roles = await identityService.listRoles(c.get('db'), page, limit)
  return c.json({ data: roles, page, limit })
}

// GET /identity/roles/:id
export async function getRoleHandler(c: Context<AppEnv>): Promise<Response> {
  const roleId = c.req.param('id')
  const role = await identityService.getRole(c.get('db'), roleId)
  if (!role) return c.json({ error: 'ROLE_NOT_FOUND', message: 'Role not found' }, 404)
  return c.json({ data: role })
}

// POST /identity/roles
export async function createRoleHandler(c: Context<AppEnv>): Promise<Response> {
  try {
    const body = await c.req.json()
    const input = identityService.parseRole(body)
    const role = await identityService.createRole(c.get('db'), input)
    return c.json({ data: role }, 201)
  } catch (e) {
    if (isZodError(e)) return c.json({ error: 'VALIDATION_ERROR', message: zodMessage(e) }, 400)
    if (e instanceof Error && e.message === 'ROLE_NAME_TAKEN') {
      return c.json({ error: 'ROLE_NAME_TAKEN', message: 'Role name is already taken' }, 409)
    }
    throw e
  }
}

// PUT /identity/roles/:id
export async function updateRoleHandler(c: Context<AppEnv>): Promise<Response> {
  const roleId = c.req.param('id')
  const sysIds = getSystemIds(c.env)
  try {
    const body = await c.req.json()
    const input = identityService.parseRole(body)
    const role = await identityService.updateRole(c.get('db'), roleId, input, sysIds)
    if (!role) return c.json({ error: 'ROLE_NOT_FOUND', message: 'Role not found' }, 404)
    return c.json({ data: role })
  } catch (e) {
    if (isZodError(e)) return c.json({ error: 'VALIDATION_ERROR', message: zodMessage(e) }, 400)
    if (e instanceof Error) {
      if (e.message === 'ROLE_NOT_FOUND') return c.json({ error: 'ROLE_NOT_FOUND', message: 'Role not found' }, 404)
      if (e.message === 'CANNOT_MODIFY_SYSTEM_ROLE') return c.json({ error: 'FORBIDDEN', message: 'Cannot modify system role' }, 403)
    }
    throw e
  }
}

// DELETE /identity/roles/:id
export async function deleteRoleHandler(c: Context<AppEnv>): Promise<Response> {
  const roleId = c.req.param('id')
  const sysIds = getSystemIds(c.env)
  try {
    await identityService.deleteRole(c.get('db'), roleId, sysIds)
    return new Response(null, { status: 204 })
  } catch (e) {
    if (e instanceof Error) {
      if (e.message === 'ROLE_NOT_FOUND') return c.json({ error: 'ROLE_NOT_FOUND', message: 'Role not found' }, 404)
      if (e.message === 'CANNOT_DELETE_SYSTEM_ROLE') return c.json({ error: 'FORBIDDEN', message: 'Cannot delete system role' }, 403)
    }
    throw e
  }
}

// POST /identity/roles/:id/members
export async function addRoleMemberHandler(c: Context<AppEnv>): Promise<Response> {
  const roleId = c.req.param('id')
  const body = await c.req.json<{ userId?: string }>()
  if (!body.userId) {
    return c.json({ error: 'VALIDATION_ERROR', message: 'userId is required' }, 400)
  }
  try {
    await identityService.addRoleMember(c.get('db'), roleId, body.userId)
    return new Response(null, { status: 204 })
  } catch (e) {
    if (e instanceof Error) {
      if (e.message === 'ROLE_NOT_FOUND') return c.json({ error: 'ROLE_NOT_FOUND', message: 'Role not found' }, 404)
      if (e.message === 'USER_NOT_FOUND') return c.json({ error: 'USER_NOT_FOUND', message: 'User not found' }, 404)
    }
    throw e
  }
}

// DELETE /identity/roles/:id/members/:userId
export async function removeRoleMemberHandler(c: Context<AppEnv>): Promise<Response> {
  const roleId = c.req.param('id')
  const userId = c.req.param('userId')
  try {
    await identityService.removeRoleMember(c.get('db'), roleId, userId)
    return new Response(null, { status: 204 })
  } catch (e) {
    if (e instanceof Error && e.message === 'MEMBER_NOT_FOUND') {
      return c.json({ error: 'MEMBER_NOT_FOUND', message: 'Member not found in role' }, 404)
    }
    throw e
  }
}
