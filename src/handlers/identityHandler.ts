import type { Context } from 'hono'
import type { AppEnv } from '../types'
import { isZodError, zodMessage } from '../utils/zodHelper'
import * as identityService from '../services/identityService'
import { SYSTEM_USER_ADMIN_GROUP_ID } from '../utils/constants'

// ユーザ管理権限チェック用ヘルパー
// isAdmin (bbsAdmin) とは別に、userAdminGroup メンバーかどうかを判定する
function isUserAdmin(c: Context<AppEnv>): boolean {
  return c.get('userGroupIds').includes(SYSTEM_USER_ADMIN_GROUP_ID)
}

// ── ユーザ操作 ────────────────────────────────────────────

// GET /identity/user
export async function listUsersHandler(c: Context<AppEnv>): Promise<Response> {
  const users = await identityService.listUsers(c.env.DB)
  return c.json({ data: users })
}

// GET /identity/user/me
export async function getMeHandler(c: Context<AppEnv>): Promise<Response> {
  const userId = c.get('userId')!
  const user = await identityService.getUser(c.env.DB, userId, userId, true)
  if (!user) return c.json({ error: 'USER_NOT_FOUND', message: 'User not found' }, 404)
  return c.json({ data: user })
}

// GET /identity/user/:id
export async function getUserHandler(c: Context<AppEnv>): Promise<Response> {
  const targetId = c.req.param('id')
  try {
    const user = await identityService.getUser(c.env.DB, targetId, c.get('userId'), isUserAdmin(c))
    if (!user) return c.json({ error: 'USER_NOT_FOUND', message: 'User not found' }, 404)
    return c.json({ data: user })
  } catch (e) {
    if (e instanceof Error && e.message === 'FORBIDDEN') {
      return c.json({ error: 'FORBIDDEN', message: 'Insufficient permissions' }, 403)
    }
    throw e
  }
}

// PUT /identity/user/:id
export async function updateUserHandler(c: Context<AppEnv>): Promise<Response> {
  const targetId = c.req.param('id')
  try {
    const body = await c.req.json()
    const input = identityService.parseUpdateUser(body)
    const user = await identityService.updateUser(c.env.DB, targetId, input, c.get('userId'), isUserAdmin(c))
    if (!user) return c.json({ error: 'USER_NOT_FOUND', message: 'User not found' }, 404)
    return c.json({ data: user })
  } catch (e) {
    if (isZodError(e)) return c.json({ error: 'VALIDATION_ERROR', message: zodMessage(e) }, 400)
    if (e instanceof Error) {
      if (e.message === 'FORBIDDEN') return c.json({ error: 'FORBIDDEN', message: 'Insufficient permissions' }, 403)
      if (e.message === 'USERNAME_TAKEN') return c.json({ error: 'USERNAME_TAKEN', message: 'Username is already taken' }, 409)
    }
    throw e
  }
}

// DELETE /identity/user/:id
export async function deleteUserHandler(c: Context<AppEnv>): Promise<Response> {
  const targetId = c.req.param('id')
  try {
    await identityService.deleteUser(c.env.DB, targetId)
    return new Response(null, { status: 204 })
  } catch (e) {
    if (e instanceof Error) {
      if (e.message === 'USER_NOT_FOUND') return c.json({ error: 'USER_NOT_FOUND', message: 'User not found' }, 404)
      if (e.message === 'CANNOT_DELETE_SYSTEM_USER') return c.json({ error: 'FORBIDDEN', message: 'Cannot delete system user' }, 403)
    }
    throw e
  }
}

// PUT /identity/user/:id/password
export async function changePasswordHandler(c: Context<AppEnv>): Promise<Response> {
  const userId = c.get('userId')!
  try {
    const body = await c.req.json()
    const input = identityService.parseChangePassword(body)
    await identityService.changePassword(c.env.DB, userId, input)
    return new Response(null, { status: 204 })
  } catch (e) {
    if (isZodError(e)) return c.json({ error: 'VALIDATION_ERROR', message: zodMessage(e) }, 400)
    if (e instanceof Error) {
      if (e.message === 'USER_NOT_FOUND') return c.json({ error: 'USER_NOT_FOUND', message: 'User not found' }, 404)
      if (e.message === 'INVALID_PASSWORD') return c.json({ error: 'INVALID_PASSWORD', message: 'Current password is incorrect' }, 400)
    }
    throw e
  }
}

// ── グループ操作 ──────────────────────────────────────────

// GET /identity/group
export async function listGroupsHandler(c: Context<AppEnv>): Promise<Response> {
  const groups = await identityService.listGroups(c.env.DB)
  return c.json({ data: groups })
}

// GET /identity/group/:id
export async function getGroupHandler(c: Context<AppEnv>): Promise<Response> {
  const groupId = c.req.param('id')
  const group = await identityService.getGroup(c.env.DB, groupId)
  if (!group) return c.json({ error: 'GROUP_NOT_FOUND', message: 'Group not found' }, 404)
  return c.json({ data: group })
}

// POST /identity/group
export async function createGroupHandler(c: Context<AppEnv>): Promise<Response> {
  try {
    const body = await c.req.json()
    const input = identityService.parseGroup(body)
    const group = await identityService.createGroup(c.env.DB, input)
    return c.json({ data: group }, 201)
  } catch (e) {
    if (isZodError(e)) return c.json({ error: 'VALIDATION_ERROR', message: zodMessage(e) }, 400)
    if (e instanceof Error && e.message === 'GROUP_NAME_TAKEN') {
      return c.json({ error: 'GROUP_NAME_TAKEN', message: 'Group name is already taken' }, 409)
    }
    throw e
  }
}

// PUT /identity/group/:id
export async function updateGroupHandler(c: Context<AppEnv>): Promise<Response> {
  const groupId = c.req.param('id')
  try {
    const body = await c.req.json()
    const input = identityService.parseGroup(body)
    const group = await identityService.updateGroup(c.env.DB, groupId, input)
    if (!group) return c.json({ error: 'GROUP_NOT_FOUND', message: 'Group not found' }, 404)
    return c.json({ data: group })
  } catch (e) {
    if (isZodError(e)) return c.json({ error: 'VALIDATION_ERROR', message: zodMessage(e) }, 400)
    if (e instanceof Error) {
      if (e.message === 'GROUP_NOT_FOUND') return c.json({ error: 'GROUP_NOT_FOUND', message: 'Group not found' }, 404)
      if (e.message === 'CANNOT_MODIFY_SYSTEM_GROUP') return c.json({ error: 'FORBIDDEN', message: 'Cannot modify system group' }, 403)
    }
    throw e
  }
}

// DELETE /identity/group/:id
export async function deleteGroupHandler(c: Context<AppEnv>): Promise<Response> {
  const groupId = c.req.param('id')
  try {
    await identityService.deleteGroup(c.env.DB, groupId)
    return new Response(null, { status: 204 })
  } catch (e) {
    if (e instanceof Error) {
      if (e.message === 'GROUP_NOT_FOUND') return c.json({ error: 'GROUP_NOT_FOUND', message: 'Group not found' }, 404)
      if (e.message === 'CANNOT_DELETE_SYSTEM_GROUP') return c.json({ error: 'FORBIDDEN', message: 'Cannot delete system group' }, 403)
    }
    throw e
  }
}

// POST /identity/group/:id/members
export async function addGroupMemberHandler(c: Context<AppEnv>): Promise<Response> {
  const groupId = c.req.param('id')
  const body = await c.req.json<{ userId?: string }>()
  if (!body.userId) {
    return c.json({ error: 'VALIDATION_ERROR', message: 'userId is required' }, 400)
  }
  try {
    await identityService.addGroupMember(c.env.DB, groupId, body.userId)
    return new Response(null, { status: 204 })
  } catch (e) {
    if (e instanceof Error) {
      if (e.message === 'GROUP_NOT_FOUND') return c.json({ error: 'GROUP_NOT_FOUND', message: 'Group not found' }, 404)
      if (e.message === 'USER_NOT_FOUND') return c.json({ error: 'USER_NOT_FOUND', message: 'User not found' }, 404)
    }
    throw e
  }
}

// DELETE /identity/group/:id/members/:userId
export async function removeGroupMemberHandler(c: Context<AppEnv>): Promise<Response> {
  const groupId = c.req.param('id')
  const userId = c.req.param('userId')
  try {
    await identityService.removeGroupMember(c.env.DB, groupId, userId)
    return new Response(null, { status: 204 })
  } catch (e) {
    if (e instanceof Error && e.message === 'MEMBER_NOT_FOUND') {
      return c.json({ error: 'MEMBER_NOT_FOUND', message: 'Member not found in group' }, 404)
    }
    throw e
  }
}
