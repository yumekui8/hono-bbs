import { z } from 'zod'
import type { User, Group } from '../types'
import type { SystemIds } from '../utils/constants'
import * as userRepository from '../repository/userRepository'
import * as groupRepository from '../repository/groupRepository'
import { hashPassword, verifyPassword } from '../utils/password'

// ユーザ作成スキーマ (POST /identity/users)
const createUserSchema = z.object({
  id: z.string().min(7).max(128).regex(/^[a-zA-Z0-9_-]+$/, 'id は英数字・_・- のみ使用できます'),
  displayName: z.string().max(128).optional(),
  password: z.string().min(8).max(128),
})

// 一般ユーザが自分自身を更新できるフィールド
// currentPassword + newPassword は両方指定するかどうか
const updateProfileSchema = z.object({
  displayName: z.string().max(128).optional(),
  bio: z.string().max(500).optional().nullable(),
  email: z.string().email('メールアドレスの形式が正しくありません').max(256).optional().nullable(),
  currentPassword: z.string().min(1).optional(),
  newPassword: z.string().min(8).max(128).optional(),
}).refine(
  d => {
    // currentPassword と newPassword は両方指定するか両方省略するかのどちらか
    const hasCurrent = d.currentPassword !== undefined
    const hasNew = d.newPassword !== undefined
    return hasCurrent === hasNew
  },
  { message: 'currentPassword と newPassword は両方指定してください' },
)

// 管理者が任意ユーザを更新できるフィールド (isActive を含む、パスワード変更は不可)
const updateUserAdminSchema = z.object({
  displayName: z.string().max(128).optional(),
  bio: z.string().max(500).optional().nullable(),
  email: z.string().email('メールアドレスの形式が正しくありません').max(256).optional().nullable(),
  isActive: z.boolean().optional(),
})

const groupSchema = z.object({
  name: z.string().min(1).max(100).regex(/^[a-zA-Z0-9_-]+$/, 'グループ名は英数字・_・- のみ使用できます'),
})

export type CreateUserInput = z.infer<typeof createUserSchema>
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>
export type UpdateUserAdminInput = z.infer<typeof updateUserAdminSchema>
export type GroupInput = z.infer<typeof groupSchema>

export function parseCreateUser(data: unknown): CreateUserInput {
  return createUserSchema.parse(data)
}

export function parseUpdateProfile(data: unknown): UpdateProfileInput {
  return updateProfileSchema.parse(data)
}

export function parseUpdateUserAdmin(data: unknown): UpdateUserAdminInput {
  return updateUserAdminSchema.parse(data)
}

export function parseGroup(data: unknown): GroupInput {
  return groupSchema.parse(data)
}

// ── ユーザ操作 ────────────────────────────────────────────

// ユーザ新規作成 (Turnstile 必須の POST /identity/users)
export async function createUser(
  db: D1Database,
  input: CreateUserInput,
  sysIds: SystemIds,
): Promise<User> {
  const existing = await userRepository.findUserById(db, input.id)
  if (existing) throw new Error('USER_ID_TAKEN')

  const now = new Date().toISOString()
  const passwordHash = await hashPassword(input.password)
  const displayName = input.displayName ?? input.id

  // 新規ユーザは generalGroup をプライマリグループとして所属させる
  await userRepository.insertUser(db, input.id, displayName, passwordHash, sysIds.generalGroupId, now)
  await groupRepository.insertUserGroup(db, input.id, sysIds.generalGroupId)

  return (await userRepository.findUserById(db, input.id))!
}

// ユーザ一覧 (ページネーション対応)
export async function listUsers(db: D1Database, page: number, limit: number): Promise<User[]> {
  return userRepository.listUsers(db, page, limit)
}

export async function getUser(
  db: D1Database,
  targetUserId: string,
  requestUserId: string | null,
  isUserAdmin: boolean,
): Promise<User | null> {
  if (!isUserAdmin && requestUserId !== targetUserId) throw new Error('FORBIDDEN')
  return userRepository.findUserById(db, targetUserId)
}

// 自分のプロフィール更新 (パスワード変更も同時に可能)
export async function updateProfile(
  db: D1Database,
  userId: string,
  input: UpdateProfileInput,
): Promise<User | null> {
  // パスワード変更が要求された場合
  if (input.currentPassword !== undefined && input.newPassword !== undefined) {
    const result = await userRepository.findUserByIdWithHash(db, userId)
    if (!result) throw new Error('USER_NOT_FOUND')
    const ok = await verifyPassword(input.currentPassword, result.passwordHash)
    if (!ok) throw new Error('INVALID_PASSWORD')
    const newHash = await hashPassword(input.newPassword)
    await userRepository.updateUserPassword(db, userId, newHash, new Date().toISOString())
  }

  const now = new Date().toISOString()
  await userRepository.updateUser(db, userId, {
    displayName: input.displayName,
    bio: input.bio,
    email: input.email,
    updatedAt: now,
  })
  return userRepository.findUserById(db, userId)
}

// 管理者による任意ユーザ更新 (isActive 変更可)
export async function updateUser(
  db: D1Database,
  targetUserId: string,
  input: UpdateUserAdminInput,
  requestUserId: string | null,
  isUserAdmin: boolean,
): Promise<User | null> {
  if (!isUserAdmin && requestUserId !== targetUserId) throw new Error('FORBIDDEN')

  const now = new Date().toISOString()
  await userRepository.updateUser(db, targetUserId, {
    displayName: input.displayName,
    bio: input.bio,
    email: input.email,
    isActive: input.isActive,
    updatedAt: now,
  })
  return userRepository.findUserById(db, targetUserId)
}

export async function deleteUser(
  db: D1Database,
  targetUserId: string,
  sysIds: SystemIds,
): Promise<void> {
  if (targetUserId === sysIds.adminUserId) throw new Error('CANNOT_DELETE_SYSTEM_USER')
  const deleted = await userRepository.deleteUser(db, targetUserId)
  if (!deleted) throw new Error('USER_NOT_FOUND')
}

export async function deleteMe(
  db: D1Database,
  userId: string,
  sysIds: SystemIds,
): Promise<void> {
  if (userId === sysIds.adminUserId) throw new Error('CANNOT_DELETE_SYSTEM_USER')
  const deleted = await userRepository.deleteUser(db, userId)
  if (!deleted) throw new Error('USER_NOT_FOUND')
}

// ── グループ操作 ──────────────────────────────────────────

export async function listGroups(db: D1Database, page: number, limit: number): Promise<Group[]> {
  return groupRepository.listGroups(db, page, limit)
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
  sysIds: SystemIds,
): Promise<Group | null> {
  // システムグループは変更不可
  const systemGroups = [sysIds.userAdminGroupId, sysIds.bbsAdminGroupId, sysIds.adminGroupId, sysIds.generalGroupId]
  if (systemGroups.includes(groupId)) {
    throw new Error('CANNOT_MODIFY_SYSTEM_GROUP')
  }
  const updated = await groupRepository.updateGroup(db, groupId, input.name)
  if (!updated) throw new Error('GROUP_NOT_FOUND')
  return groupRepository.findGroupById(db, groupId)
}

export async function deleteGroup(
  db: D1Database,
  groupId: string,
  sysIds: SystemIds,
): Promise<void> {
  // システムグループは削除不可
  const systemGroups = [sysIds.userAdminGroupId, sysIds.bbsAdminGroupId, sysIds.adminGroupId, sysIds.generalGroupId]
  if (systemGroups.includes(groupId)) {
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
