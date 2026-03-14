import { Hono } from 'hono'
import type { AppEnv } from '../types'
import {
  listUsersHandler,
  createUserHandler,
  getUserHandler,
  updateUserHandler,
  deleteUserHandler,
  listGroupsHandler,
  getGroupHandler,
  createGroupHandler,
  updateGroupHandler,
  deleteGroupHandler,
  addGroupMemberHandler,
  removeGroupMemberHandler,
} from '../handlers/identityHandler'
import { requireLogin, requireUserAdminGroup } from '../middleware/auth'
import { requireTurnstile } from '../middleware/turnstile'

const identity = new Hono<AppEnv>()

// ── ユーザ ──────────────────────────────────────────────
// POST /users: 誰でも登録可能 (Turnstile 必須、ログイン不要)
identity.post('/users',    requireTurnstile, createUserHandler)
// その他: user-admin-group 必須
identity.get('/users',     requireLogin, requireUserAdminGroup, listUsersHandler)
identity.get('/users/:id', requireLogin, requireUserAdminGroup, getUserHandler)
identity.put('/users/:id', requireLogin, requireUserAdminGroup, requireTurnstile, updateUserHandler)
identity.delete('/users/:id', requireLogin, requireUserAdminGroup, requireTurnstile, deleteUserHandler)

// ── グループ ────────────────────────────────────────────
identity.get('/groups',     requireLogin, requireUserAdminGroup, listGroupsHandler)
identity.get('/groups/:id', requireLogin, requireUserAdminGroup, getGroupHandler)
identity.post('/groups',    requireLogin, requireUserAdminGroup, requireTurnstile, createGroupHandler)
identity.put('/groups/:id', requireLogin, requireUserAdminGroup, requireTurnstile, updateGroupHandler)
identity.delete('/groups/:id', requireLogin, requireUserAdminGroup, requireTurnstile, deleteGroupHandler)
identity.post('/groups/:id/members',          requireLogin, requireUserAdminGroup, requireTurnstile, addGroupMemberHandler)
identity.delete('/groups/:id/members/:userId', requireLogin, requireUserAdminGroup, requireTurnstile, removeGroupMemberHandler)

export default identity
