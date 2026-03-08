import { z } from 'zod'
import type { User, Group } from '../types'
import * as userRepository from '../repository/userRepository'
import * as groupRepository from '../repository/groupRepository'
import { hashPassword, verifyPassword } from '../utils/password'
import { SYSTEM_USER_ADMIN_GROUP_ID, SYSTEM_BBS_ADMIN_GROUP_ID, SYSTEM_ADMIN_USER_ID, SYSTEM_ADMIN_GROUP_ID, SYSTEM_GENERAL_GROUP_ID } from '../utils/constants'

const updateUserSchema = z.object({
  username: z.string().min(1).max(50).regex(/^[a-zA-Z0-9_-]+$/, 'username は英数字・_・- のみ使用できます').optional(),
})

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8).max(100),
})

const groupSchema = z.object({
  name: z.string().min(1).max(100).regex(/^[a-zA-Z0-9_-]+$/, 'グループ名は英数字・_・- のみ使用できます'),
})

export type UpdateUserInput = z.infer<typeof updateUserSchema>
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>
export type GroupInput = z.infer<typeof groupSchema>

export function parseUpdateUser(data: unknown): UpdateUserInput {
  return updateUserSchema.parse(data)
}

export function parseChangePassword(data: unknown): ChangePasswordInput {
  return changePasswordSchema.parse(data)
}

export function parseGroup(data: unknown): GroupInput {
  return groupSchema.parse(data)
}

// ── ユーザ操作 ────────────────────────────────────────────

export async function listUsers(db: D1Database): Promise<User[]> {
  return userRepository.listUsers(db)
}

export async function getUser(
  db: D1Database,
  targetUserId: string,
  requestUserId: string | null,
  isAdmin: boolean,
): Promise<User | null> {
  if (!isAdmin && requestUserId !== targetUserId) throw new Error('FORBIDDEN')
  return userRepository.findUserById(db, targetUserId)
}

export async function updateUser(
  db: D1Database,
  targetUserId: string,
  input: UpdateUserInput,
  requestUserId: string | null,
  isAdmin: boolean,
): Promise<User | null> {
  if (!isAdmin && requestUserId !== targetUserId) throw new Error('FORBIDDEN')
  if (input.username) {
    const existing = await userRepository.findUserByUsername(db, input.username)
    if (existing && existing.id !== targetUserId) throw new Error('USERNAME_TAKEN')
  }
  await userRepository.updateUser(db, targetUserId, input)
  return userRepository.findUserById(db, targetUserId)
}

export async function changePassword(
  db: D1Database,
  userId: string,
  input: ChangePasswordInput,
): Promise<void> {
  const result = await userRepository.findUserByIdWithHash(db, userId)
  if (!result) throw new Error('USER_NOT_FOUND')
  const ok = await verifyPassword(input.currentPassword, result.passwordHash)
  if (!ok) throw new Error('INVALID_PASSWORD')
  const newHash = await hashPassword(input.newPassword)
  await userRepository.updateUserPassword(db, userId, newHash)
}

export async function deleteUser(db: D1Database, targetUserId: string): Promise<void> {
  // システムユーザは削除不可
  if (targetUserId === SYSTEM_ADMIN_USER_ID) throw new Error('CANNOT_DELETE_SYSTEM_USER')
  const deleted = await userRepository.deleteUser(db, targetUserId)
  if (!deleted) throw new Error('USER_NOT_FOUND')
}

// ── グループ操作 ──────────────────────────────────────────

export async function listGroups(db: D1Database): Promise<Group[]> {
  return groupRepository.listGroups(db)
}

export async function getGroup(db: D1Database, groupId: string): Promise<Group | null> {
  return groupRepository.findGroupById(db, groupId)
}

export async function createGroup(db: D1Database, input: GroupInput): Promise<Group> {
  const existing = await groupRepository.findGroupByName(db, input.name)
  if (existing) throw new Error('GROUP_NAME_TAKEN')
  const group: Group = {
    id: crypto.randomUUID(),
    name: input.name,
    createdAt: new Date().toISOString(),
  }
  await groupRepository.insertGroup(db, group)
  return group
}

export async function updateGroup(
  db: D1Database,
  groupId: string,
  input: GroupInput,
): Promise<Group | null> {
  // システムグループは変更不可
  if ([SYSTEM_USER_ADMIN_GROUP_ID, SYSTEM_BBS_ADMIN_GROUP_ID, SYSTEM_ADMIN_GROUP_ID, SYSTEM_GENERAL_GROUP_ID].includes(groupId)) {
    throw new Error('CANNOT_MODIFY_SYSTEM_GROUP')
  }
  const updated = await groupRepository.updateGroup(db, groupId, input.name)
  if (!updated) throw new Error('GROUP_NOT_FOUND')
  return groupRepository.findGroupById(db, groupId)
}

export async function deleteGroup(db: D1Database, groupId: string): Promise<void> {
  // システムグループは削除不可
  if ([SYSTEM_USER_ADMIN_GROUP_ID, SYSTEM_BBS_ADMIN_GROUP_ID, SYSTEM_ADMIN_GROUP_ID, SYSTEM_GENERAL_GROUP_ID].includes(groupId)) {
    throw new Error('CANNOT_DELETE_SYSTEM_GROUP')
  }
  const deleted = await groupRepository.deleteGroup(db, groupId)
  if (!deleted) throw new Error('GROUP_NOT_FOUND')
}

export async function addGroupMember(
  db: D1Database,
  groupId: string,
  userId: string,
): Promise<void> {
  const group = await groupRepository.findGroupById(db, groupId)
  if (!group) throw new Error('GROUP_NOT_FOUND')
  const user = await userRepository.findUserById(db, userId)
  if (!user) throw new Error('USER_NOT_FOUND')
  // OR IGNORE で重複を無視
  await groupRepository.insertUserGroup(db, userId, groupId)
}

export async function removeGroupMember(
  db: D1Database,
  groupId: string,
  userId: string,
): Promise<void> {
  const deleted = await groupRepository.deleteUserGroup(db, userId, groupId)
  if (!deleted) throw new Error('MEMBER_NOT_FOUND')
}
