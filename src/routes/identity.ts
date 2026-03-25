import { Hono } from 'hono'
import type { AppEnv } from '../types'
import {
  listUsersHandler,
  createUserHandler,
  getUserHandler,
  updateUserHandler,
  deleteUserHandler,
  listRolesHandler,
  getRoleHandler,
  createRoleHandler,
  updateRoleHandler,
  deleteRoleHandler,
  addRoleMemberHandler,
  removeRoleMemberHandler,
} from '../handlers/identityHandler'
import { requireLogin, requireUserAdminRole } from '../middleware/auth'
import { requireTurnstile } from '../middleware/turnstile'

const identity = new Hono<AppEnv>()

// ── ユーザ ──────────────────────────────────────────────
// POST /users: 誰でも登録可能 (Turnstile 必須、ログイン不要)
identity.post('/users',    requireTurnstile, createUserHandler)
// その他: user-admin-role 必須
identity.get('/users',     requireLogin, requireUserAdminRole, listUsersHandler)
identity.get('/users/:id', requireLogin, requireUserAdminRole, getUserHandler)
identity.put('/users/:id', requireLogin, requireUserAdminRole, requireTurnstile, updateUserHandler)
identity.delete('/users/:id', requireLogin, requireUserAdminRole, requireTurnstile, deleteUserHandler)

// ── ロール ──────────────────────────────────────────────
identity.get('/roles',     requireLogin, requireUserAdminRole, listRolesHandler)
identity.get('/roles/:id', requireLogin, requireUserAdminRole, getRoleHandler)
identity.post('/roles',    requireLogin, requireUserAdminRole, requireTurnstile, createRoleHandler)
identity.put('/roles/:id', requireLogin, requireUserAdminRole, requireTurnstile, updateRoleHandler)
identity.delete('/roles/:id', requireLogin, requireUserAdminRole, requireTurnstile, deleteRoleHandler)
identity.post('/roles/:id/members',          requireLogin, requireUserAdminRole, requireTurnstile, addRoleMemberHandler)
identity.delete('/roles/:id/members/:userId', requireLogin, requireUserAdminRole, requireTurnstile, removeRoleMemberHandler)

export default identity
