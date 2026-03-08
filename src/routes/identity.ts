import { Hono } from 'hono'
import type { AppEnv } from '../types'
import {
  listUsersHandler,
  getMeHandler,
  getUserHandler,
  updateUserHandler,
  deleteUserHandler,
  changePasswordHandler,
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
identity.get('/user', requireLogin, requireUserAdminGroup, listUsersHandler)
// /user/me は :id より先に登録して誤マッチを防ぐ
identity.get('/user/me', requireLogin, getMeHandler)
identity.get('/user/:id', requireLogin, getUserHandler)
identity.put('/user/:id', requireLogin, requireTurnstile, updateUserHandler)
identity.delete('/user/:id', requireLogin, requireUserAdminGroup, requireTurnstile, deleteUserHandler)
identity.put('/user/:id/password', requireLogin, requireTurnstile, changePasswordHandler)

// ── グループ ────────────────────────────────────────────
identity.get('/group', requireLogin, listGroupsHandler)
identity.get('/group/:id', requireLogin, getGroupHandler)
identity.post('/group', requireLogin, requireUserAdminGroup, requireTurnstile, createGroupHandler)
identity.put('/group/:id', requireLogin, requireUserAdminGroup, requireTurnstile, updateGroupHandler)
identity.delete('/group/:id', requireLogin, requireUserAdminGroup, requireTurnstile, deleteGroupHandler)
identity.post('/group/:id/members', requireLogin, requireUserAdminGroup, requireTurnstile, addGroupMemberHandler)
identity.delete('/group/:id/members/:userId', requireLogin, requireUserAdminGroup, requireTurnstile, removeGroupMemberHandler)

export default identity
